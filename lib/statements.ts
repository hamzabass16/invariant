/**
 * Statements and fund reports: a PDF a bank or a fund sends becomes holdings
 * in the one holdings model (lib/holdings.ts). Pure: the request, the
 * reading of the answer, the check of every figure against the document's
 * own text, and the merge into the book. The call itself is made in
 * lib/statements-run.ts on the person's own provider.
 *
 * The model reads; the app checks. Every figure the model records must be
 * printed in the document's text (with its thousands separators and decimal
 * mark, in either convention), every ISIN too, and the positions must add up
 * to the total the statement prints. A document whose figures all check is
 * applied; anything else waits on the Statements screen for the person to
 * look at it and confirm, so a misread number never reaches a figure on its
 * own. A document that cannot be read is a sentence, never an empty account.
 *
 * Kept in the vault's `statements` file: what each document said, never the
 * document itself and never anything of it in a log.
 */
import { z } from "zod";

import { bookSchema, type Book, type Fx, type Holding, type LookThroughRow } from "@/lib/holdings";
import { MODELS } from "@/lib/models";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const num = z.number().finite();

export const STATEMENT_KINDS = ["bank_statement", "fund_report", "notice", "other"] as const;
export const STATEMENT_MODEL = MODELS.standard;
/** The text sent to the model, at most; a longer document is read from its first part and says so. */
export const MAX_TEXT_CHARS = 150_000;
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/** The themes a holding may carry, so a statement's positions group with the rest of the book. */
export const STATEMENT_THEMES = [
  "AI and semiconductors",
  "Software",
  "Fintech",
  "Healthcare",
  "Energy",
  "Materials and mining",
  "Industrials",
  "Consumer",
  "Financials",
  "Real estate",
  "Emerging markets",
  "Fixed income",
  "Cash",
  "Venture",
  "Gold and precious metals",
  "Space and defence",
] as const;

const positionSchema = z.object({
  assetClass: z.enum(["equity", "etf", "bond", "deposit", "cash", "other"]).describe("etf for any listed fund, ETF, tracker or certificate; other for structured products"),
  name: z.string().min(1).max(120).describe("As printed"),
  isin: z
    .string()
    .regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/)
    .nullable()
    .describe("As printed; null when the statement prints none"),
  ticker: z.string().max(20).nullable().describe("Only when printed, or a US listing's well-known ticker; else null"),
  currency: currency.describe("The position's own currency"),
  quantity: num.nullable().describe("Units, shares or nominal as printed; null for cash"),
  price: num.nullable().describe("Latest price per unit as printed"),
  value: num.describe("Market value in the position's own currency, as printed"),
  valueRef: num.nullable().describe("Market value in the statement's reference currency, as printed; null when not printed"),
  costBasis: num.nullable().describe("Total cost in the position's currency when printed; when only a unit cost is printed, null"),
  country: z.string().regex(/^[A-Z]{2}$/).nullable().describe("ISO country of the issuer when evident"),
  sector: z.string().max(40).nullable(),
  themes: z.array(z.enum(STATEMENT_THEMES)).max(3),
  coupon: num.nullable().describe("Bonds: coupon in percent"),
  maturity: isoDate.nullable().describe("Bonds and deposits"),
  yieldPct: num.nullable().describe("Bonds: yield as printed, never computed"),
  rating: z.string().max(10).nullable(),
  ratePct: num.nullable().describe("Deposits: interest rate as printed"),
});
export type StatementPosition = z.infer<typeof positionSchema>;

const companySchema = z.object({
  name: z.string().min(1).max(120),
  ticker: z.string().max(20).nullable().describe("Only when the company is listed"),
  sector: z.string().max(40).nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  stage: z.string().max(40).nullable(),
  themes: z.array(z.enum(STATEMENT_THEMES)).max(3),
  fairValue: num.nullable().describe("The fund's holding value in the report's currency, as printed; null when the report gives none"),
});

const fundSchema = z.object({
  name: z.string().min(1).max(120).describe("The fund's name as printed"),
  manager: z.string().max(80),
  vintage: z.number().int().min(1980).max(2100).nullable(),
  currency,
  nav: num.nullable().describe("The investor's own capital account value, as printed; null when the report only gives the whole fund's figures"),
  commitment: num.nullable().describe("The investor's own commitment; null unless printed"),
  called: num.nullable().describe("The investor's own paid-in capital; null unless printed"),
  distributions: num.nullable().describe("The investor's own distributions to date; null unless printed"),
  dpi: num.nullable(),
  tvpi: num.nullable(),
  irrPct: num.nullable().describe("Net IRR in percent, as printed"),
  companies: z.array(companySchema).max(80),
});

/** What the model records about one document: the tool input. */
export const extractionSchema = z.object({
  kind: z.enum(STATEMENT_KINDS).describe("notice: an email that only says a statement is ready, or a forwarding note; other: commentary, newsletters, anything without holdings"),
  institution: z.string().min(1).max(80).describe("The bank or fund manager that issued it"),
  account: z.string().max(40).nullable().describe("Portfolio or account number as printed; null when none"),
  asOf: isoDate.describe("The date the values are as of"),
  currency: currency.describe("The statement's reference currency"),
  totalValue: num.nullable().describe("The statement's printed total in the reference currency; null when none"),
  positions: z.array(positionSchema).max(300),
  fund: fundSchema.nullable(),
  notes: z.array(z.string().max(200)).max(8).describe("What could not be read, in plain words"),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const STATEMENT_STATUSES = ["applied", "review", "failed", "ignored"] as const;

export const statementDocSchema = z.object({
  /** The first 16 hex of the document's SHA-256, so the same PDF is read once. */
  id: z.string().regex(/^[0-9a-f]{16}$/),
  name: z.string().max(160),
  receivedAt: z.string(),
  via: z.enum(["upload", "inbox"]),
  status: z.enum(STATEMENT_STATUSES),
  /** Why it waits, why it failed, or why it was set aside; null when it was applied as read. */
  sentence: z.string().max(600).nullable(),
  /** How it was read: from the PDF's text (every figure checked), or from the PDF itself (nothing to check against). */
  readFrom: z.enum(["text", "pdf"]).nullable(),
  extraction: extractionSchema.nullable(),
  /** Figures not found in the document's text, by position or field; empty when all were found. */
  unchecked: z.array(z.string().max(160)).max(60),
  confirmedAt: z.string().nullable(),
  /** How many reads in a row have failed in a way a later run could mend (`triesAfter`); the morning stops at STATEMENT_MAX_TRIES. Missing on entries kept before 11 Nov 2026, read as one. */
  tries: z.number().int().min(0).optional(),
});
export type StatementDoc = z.infer<typeof statementDocSchema>;

/** Failed reads of one emailed document before the morning stops reading it again, so a document the model cannot read is not paid for every day; an upload is always read. */
export const STATEMENT_MAX_TRIES = 3;

/** The failed reads counted on a new failure, from the entry it replaces. */
export function triesAfter(known: StatementDoc | undefined): number {
  return known?.status === "failed" ? (known.tries ?? 1) + 1 : 1;
}

/** Whether a later run should read the document again: a failure it can mend (not too large, not a PDF), under STATEMENT_MAX_TRIES. */
export function readAgain(entry: StatementDoc): boolean {
  return entry.status === "failed" && !/over 4 MB|not a PDF/.test(entry.sentence ?? "") && (entry.tries ?? 1) < STATEMENT_MAX_TRIES;
}

export const statementsFileSchema = z.object({
  version: z.literal(1),
  documents: z.array(statementDocSchema).max(400),
  /** The emails from the statements inbox already read to the end, by the first 16 hex of their Message-ID's SHA-256; absent before the inbox was read. */
  messages: z.array(z.string().regex(/^[0-9a-f]{16}$/)).max(2000).default([]),
  updated: z.string(),
});
export type StatementsFile = z.infer<typeof statementsFileSchema>;
export const EMPTY_STATEMENTS: StatementsFile = { version: 1, documents: [], messages: [], updated: "" };

// ---------------------------------------------------------------------------
// Reading the text

/** Whether a PDF's text layer can be read as words; a watermark or a scan gives noise or nothing. */
export function textLooksReadable(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 200) return false;
  const words = t.split(" ");
  const wordLike = words.filter((w) => /^[A-Za-zÀ-ÿ]{2,}[.,;:)]?$/.test(w)).length;
  return wordLike / words.length > 0.25;
}

/**
 * Every number printed in a text, read both ways: 1'234.56, 1,234.56,
 * 1.234,56 and 1 234 are all 1234.56 or 1234. A token that could mean two
 * numbers counts as both.
 */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const tokens = text.match(/-?\d[\d'’,.]*\d|-?\d/g) ?? [];
  for (const raw of tokens) {
    const tok = raw.replace(/[’]/g, "'");
    const neg = tok.startsWith("-");
    const body = neg ? tok.slice(1) : tok;
    const candidates = new Set<string>();
    candidates.add(body.replace(/'/g, "").replace(/,/g, "")); // 1'234.56, 1,234.56
    candidates.add(body.replace(/'/g, "").replace(/\./g, "").replace(/,/g, ".")); // 1.234,56
    for (const c of candidates) {
      if (!/^\d+(\.\d+)?$/.test(c)) continue;
      const n = Number(c);
      if (Number.isFinite(n)) out.push(neg ? -n : n);
    }
  }
  return out;
}

/** Whether a figure is printed in the text, allowing for the rounding a statement prints (to the unit, or to two places). */
export function printed(n: number, printedNumbers: Set<number> | number[]): boolean {
  const list = Array.isArray(printedNumbers) ? printedNumbers : [...printedNumbers];
  const a = Math.abs(n);
  return list.some((p) => {
    const b = Math.abs(p);
    if (b === a) return true;
    if (a >= 1000 && Math.abs(b - a) < 0.51) return true; // printed to the unit
    if (Math.abs(b - a) < 0.0051) return true; // printed to two places
    return false;
  });
}

/** The figures of one document that its text does not print, as short labels; empty when every one is there. */
export function uncheckedFigures(x: Extraction, text: string): string[] {
  const nums = numbersIn(text);
  const flat = text.replace(/\s+/g, "");
  const out: string[] = [];
  const need = (label: string, n: number | null) => {
    if (n !== null && n !== 0 && !printed(n, nums)) out.push(label);
  };
  for (const p of x.positions) {
    const label = p.name.slice(0, 60);
    need(`${label}: value`, p.value);
    need(`${label}: value in ${x.currency}`, p.valueRef);
    need(`${label}: quantity`, p.quantity);
    if (p.isin && !flat.includes(p.isin)) out.push(`${label}: ISIN`);
  }
  need("Total", x.totalValue);
  if (x.fund) {
    need("Fund NAV", x.fund.nav);
    need("Commitment", x.fund.commitment);
    need("Called", x.fund.called);
    need("Distributions", x.fund.distributions);
    for (const c of x.fund.companies) need(`${c.name.slice(0, 60)}: fair value`, c.fairValue);
  }
  return out.slice(0, 60);
}

/** The positions' sum in the reference currency, when every position carries one it can be read in. */
export function positionsTotal(x: Extraction): number | null {
  let sum = 0;
  for (const p of x.positions) {
    const v = p.valueRef ?? (p.currency === x.currency ? p.value : null);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

/** A sentence when the positions do not add up to the printed total (beyond 1.5%, for rounding and accrued interest); null when they do or there is no total. */
export function totalProblem(x: Extraction): string | null {
  if (x.totalValue === null || !x.positions.length) return null;
  const sum = positionsTotal(x);
  if (sum === null) return null;
  const gap = Math.abs(sum - x.totalValue) / Math.max(Math.abs(x.totalValue), 1);
  if (gap <= 0.015) return null;
  const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `The positions read add up to ${f(sum)} ${x.currency}; the statement prints ${f(x.totalValue)}.`;
}

// ---------------------------------------------------------------------------
// The request and the answer

export type StatementInput = { name: string; text: string | null; pdf: Uint8Array | null };

export function statementRequestBody(input: StatementInput, model = STATEMENT_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(extractionSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const content: Record<string, unknown>[] = [];
  if (input.text !== null) {
    const cut = input.text.length > MAX_TEXT_CHARS;
    content.push({ type: "text", text: `Document: ${input.name}${cut ? " (first part; the rest was cut for length)" : ""}\n\n${input.text.slice(0, MAX_TEXT_CHARS)}` });
  } else if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(input.pdf).toString("base64") }, title: input.name.slice(0, 120) });
  }
  content.push({ type: "text", text: "Record this document." });
  return {
    model,
    max_tokens: 16000,
    system: `You read one document a person received from a bank or an investment fund, and record what it holds, for their own portfolio app.

Rules:
- Copy every figure exactly as the document prints it, as a plain number (1'234.56 is 1234.56). Never compute, estimate, convert or round a figure that is not printed; when a figure is not printed, record null.
- A bank statement or portfolio report: one position per line holding (cash per currency, deposits, bonds, shares, funds, certificates). Skip subtotal and category rows. value is in the position's own currency; valueRef is the same holding in the statement's reference currency when a column prints it.
- A fund report: the fund's name, manager and vintage; the investor's own figures (capital account value, commitment, paid-in, distributions) only when the report prints the investor's own; the fund's companies with their fair value when printed. The whole fund's NAV is not the investor's NAV.
- A forwarded email or a notice that only says a statement is ready: kind notice, no positions. Commentary or a newsletter: kind other.
- themes and sector are your reading of what each holding is; everything else is the document's.
- Your whole answer is one call to record_document; write nothing outside it.`,
    tools: [{ name: "record_document", description: "Record what the document holds.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  };
}

export type StatementParse = { ok: true; extraction: Extraction } | { ok: false; reason: string; called: boolean };

/** Reads the answer: the one record_document call, validated. */
export function parseStatementResponse(body: unknown): StatementParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_document");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the document", called: false };
  const parsed = extractionSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)`, called: true };
  return { ok: true, extraction: parsed.data };
}

/**
 * The document's entry once read: applied when every figure is printed in
 * its text and the positions add up; waiting for the person otherwise; set
 * aside when it holds nothing (a notice, commentary).
 */
export function judge(base: Omit<StatementDoc, "status" | "sentence" | "unchecked" | "extraction" | "confirmedAt">, x: Extraction, text: string | null): StatementDoc {
  const doc = { ...base, extraction: x, confirmedAt: null };
  if (x.kind === "notice") return { ...doc, status: "ignored", unchecked: [], sentence: "A notice or a forwarding note, not a statement. Send the statement itself (the PDF attached to the bank's email)." };
  if (x.kind === "other") return { ...doc, status: "ignored", unchecked: [], sentence: "Commentary, not a statement: it holds no positions, so nothing was added." };
  const empty = !x.positions.length && !x.fund;
  if (empty) return { ...doc, status: "ignored", unchecked: [], sentence: "No positions could be read from it, so nothing was added." };
  // What stops the figures being used until the person looks; and what is only said.
  const blocking: string[] = [];
  const unchecked = text === null ? [] : uncheckedFigures(x, text);
  if (text === null) blocking.push("It was read from the PDF itself (its text layer cannot be read), so no figure could be checked against it.");
  else if (unchecked.length) blocking.push(`${unchecked.length} figure${unchecked.length === 1 ? " was" : "s were"} not found printed in the document.`);
  const total = totalProblem(x);
  if (total) blocking.push(total);
  const said: string[] = [];
  if (x.fund && x.fund.nav === null) said.push("The report gives the whole fund's figures, not your share; your share is in your capital account statement, so send that too.");
  if (blocking.length) return { ...doc, status: "review", unchecked, sentence: [...blocking, ...said, "Check the figures against the document, then use them or remove it."].join(" ") };
  return { ...doc, status: "applied", unchecked: [], sentence: said.length ? said.join(" ") : null };
}

/** The file with these inbox emails marked as read to the end, newest first. */
export function keepMessages(file: StatementsFile, keys: string[], now: string): StatementsFile {
  if (!keys.length) return file;
  const messages = [...new Set([...keys, ...file.messages])].slice(0, 2000);
  return statementsFileSchema.parse({ ...file, messages, updated: now });
}

/** Adds or replaces a document's entry (newest first); the same PDF read again replaces its old entry. */
export function keepDocument(file: StatementsFile, doc: StatementDoc, now: string): StatementsFile {
  const documents = [doc, ...file.documents.filter((d) => d.id !== doc.id)].slice(0, 400);
  return statementsFileSchema.parse({ version: 1, documents, messages: file.messages, updated: now });
}

// ---------------------------------------------------------------------------
// Into the book

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "x";

/** The documents in use: applied (or confirmed), the latest per account and per fund. */
export function inUse(file: StatementsFile | null): { banks: StatementDoc[]; fundNav: StatementDoc[]; fundCompanies: StatementDoc[] } {
  const docs = (file?.documents ?? []).filter((d) => d.status === "applied" && d.extraction);
  const newer = (a: StatementDoc, b: StatementDoc) => a.extraction!.asOf.localeCompare(b.extraction!.asOf) || a.receivedAt.localeCompare(b.receivedAt);
  const latest = (pick: (d: StatementDoc) => string | null) => {
    const by = new Map<string, StatementDoc>();
    for (const d of docs) {
      const k = pick(d);
      if (k === null) continue;
      const prev = by.get(k);
      if (!prev || newer(d, prev) > 0) by.set(k, d);
    }
    return [...by.values()];
  };
  return {
    banks: latest((d) => (d.extraction!.kind === "bank_statement" && d.extraction!.positions.length ? `${slug(d.extraction!.institution)}|${slug(d.extraction!.account ?? "")}` : null)),
    fundNav: latest((d) => (d.extraction!.fund && d.extraction!.fund.nav !== null ? slug(d.extraction!.fund.name) : null)),
    fundCompanies: latest((d) => (d.extraction!.fund && d.extraction!.fund.companies.length ? slug(d.extraction!.fund.name) : null)),
  };
}

/**
 * The book with the statements laid on: each account's latest statement and
 * each fund's latest report, as holdings with their own as-of dates. A
 * position in a currency nothing can convert to the base is left out and
 * said so, never guessed. Holdings a book file carried from statements are
 * replaced once any statement is in use, so nothing is counted twice.
 */
export function withStatements(book: Book | null, file: StatementsFile | null, base: string, today: string): { book: Book | null; notes: string[] } {
  const use = inUse(file);
  if (!use.banks.length && !use.fundNav.length) return { book, notes: [] };
  const notes: string[] = [];
  const fx: Fx = book ? { ...book.fx, rates: { ...book.fx.rates } } : { base, asOf: today, rates: {}, source: "statements" };
  const rate = (ccy: string): number | null => (ccy === fx.base ? 1 : (fx.rates[ccy] ?? null));
  const holdings: Holding[] = [];
  const lookThrough: LookThroughRow[] = [];
  const ids = new Set<string>();
  const uniq = (id: string) => {
    let out = id;
    for (let i = 2; ids.has(out); i++) out = `${id}-${i}`;
    ids.add(out);
    return out;
  };

  for (const d of use.banks) {
    const x = d.extraction!;
    // Rates the statement itself implies, priced through its reference currency.
    const refRate = rate(x.currency);
    if (refRate !== null) {
      for (const p of x.positions) {
        if (p.currency === x.currency || p.valueRef === null || !p.value || fx.rates[p.currency] !== undefined || p.currency === fx.base) continue;
        const r = (p.valueRef / p.value) * refRate;
        if (Number.isFinite(r) && r > 0) fx.rates[p.currency] = r;
      }
    }
    const account = `${x.institution}${x.account ? ` ${x.account}` : ""}`.slice(0, 60);
    const left: string[] = [];
    for (const p of x.positions) {
      if (rate(p.currency) === null) {
        left.push(p.currency);
        continue;
      }
      const cls = p.assetClass;
      holdings.push({
        id: uniq(`st:${slug(x.institution)}:${slug(x.account ?? "")}:${p.isin ? p.isin.toLowerCase() : slug(p.name)}`),
        account,
        source: "statements",
        assetClass: cls,
        symbol: (p.ticker ?? p.isin ?? (cls === "cash" ? p.currency : p.name)).slice(0, 40),
        name: p.name,
        quantity: p.quantity ?? (cls === "cash" || cls === "deposit" ? p.value : 1),
        price: p.price,
        value: p.value,
        costBasis: p.costBasis,
        currency: p.currency,
        asOf: x.asOf,
        valuation: "bank_statement",
        country: p.country,
        sector: p.sector,
        themes: p.themes.length ? [...p.themes] : cls === "cash" ? ["Cash"] : cls === "bond" || cls === "deposit" ? ["Fixed income"] : [],
        ...(cls === "bond" ? { bond: { issuer: p.name, isin: p.isin, coupon: p.coupon, maturity: p.maturity, yieldPct: p.yieldPct, rating: p.rating } } : {}),
        ...(cls === "deposit" ? { deposit: { ratePct: p.ratePct, start: null, maturity: p.maturity } } : {}),
      });
    }
    if (left.length) notes.push(`${account}: ${[...new Set(left)].join(", ")} position${left.length === 1 ? "" : "s"} left out, as nothing gives a rate to ${fx.base}.`);
  }

  const fundId = new Map<string, string>();
  for (const d of use.fundNav) {
    const x = d.extraction!;
    const f = x.fund!;
    if (rate(f.currency) === null) {
      notes.push(`${f.name}: left out, as nothing gives a rate from ${f.currency} to ${fx.base}.`);
      continue;
    }
    if (f.commitment === null || f.called === null) {
      notes.push(`${f.name}: its value is in, but the report gives no commitment or paid-in figure, so unfunded capital is not counted for it.`);
    }
    const id = uniq(`st:fund:${slug(f.name)}`);
    fundId.set(slug(f.name), id);
    holdings.push({
      id,
      account: f.name.slice(0, 60),
      source: "statements",
      assetClass: "private_fund",
      symbol: slug(f.name).toUpperCase().slice(0, 40),
      name: f.name,
      quantity: 1,
      price: f.nav,
      value: f.nav!,
      costBasis: f.called,
      currency: f.currency,
      asOf: x.asOf,
      valuation: "fund_report",
      country: null,
      sector: null,
      themes: ["Venture"],
      fund: {
        manager: f.manager,
        vintage: f.vintage,
        // Without a printed commitment, the fund counts as fully called: nothing unfunded is invented.
        commitment: Math.max(f.commitment ?? f.called ?? 0, 0),
        called: Math.max(f.called ?? f.commitment ?? 0, 0),
        distributions: Math.max(f.distributions ?? 0, 0),
        reported: { dpi: f.dpi, tvpi: f.tvpi, irrPct: f.irrPct },
      },
    });
  }
  for (const d of use.fundCompanies) {
    const x = d.extraction!;
    const parentId = fundId.get(slug(x.fund!.name));
    if (!parentId) {
      notes.push(`${x.fund!.name}: its companies are kept, and show once a report with your own share of the fund arrives.`);
      continue;
    }
    for (const c of x.fund!.companies) lookThrough.push({ parentId, name: c.name, ticker: c.ticker, sector: c.sector, country: c.country, stage: c.stage, themes: [...c.themes], fairValue: c.fairValue, asOf: x.asOf });
  }

  const kept = (book?.holdings ?? []).filter((h) => h.source !== "statements");
  const keptIds = new Set(kept.map((h) => h.id));
  const asOfs = [book?.asOf, ...holdings.map((h) => h.asOf)].filter((s): s is string => !!s).sort();
  const out = bookSchema.parse({
    ...(book ?? { transactions: [] }),
    asOf: book?.asOf ?? asOfs[asOfs.length - 1] ?? today,
    holdings: [...kept, ...holdings],
    lookThrough: [...(book?.lookThrough ?? []).filter((r) => keptIds.has(r.parentId)), ...lookThrough],
    transactions: book?.transactions ?? [],
    fx,
  });
  return { book: out, notes };
}

/** One line for a document on the Statements screen. */
export function describeDocument(d: StatementDoc): string {
  const x = d.extraction;
  if (!x) return d.sentence ?? "Not read.";
  const what = x.kind === "fund_report" ? "Fund report" : x.kind === "bank_statement" ? "Statement" : x.kind === "notice" ? "Notice" : "Other";
  const n = x.positions.length + (x.fund?.companies.length ?? 0);
  return `${what} from ${x.institution}${x.account ? ` (${x.account})` : ""}, as of ${x.asOf}${n ? `, ${n} line${n === 1 ? "" : "s"}` : ""}.`;
}
