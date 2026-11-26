/**
 * Portfolios: the person's accounts in named groups (an IBKR portfolio, a
 * Schwab one, private assets), seen together or one at a time. A portfolio is
 * a filter on the book's accounts, never a second book: every account belongs
 * to exactly one portfolio, so nothing is counted twice. The person chooses
 * one methodology for all of them (the setup's, as before) or one per
 * portfolio, kept here beside its accounts. Kept in the vault's `portfolios`
 * file; with no file, each account is its own portfolio and one methodology
 * applies. Pure.
 */
import { z } from "zod";

import type { Book } from "@/lib/holdings";
import { methodologySchema, type Methodology } from "@/lib/methodology";

export const MAX_PORTFOLIOS = 12;
export const METHODOLOGY_MODES = ["one", "each"] as const;
export type MethodologyMode = (typeof METHODOLOGY_MODES)[number];
export const METHODOLOGY_MODE_LABEL: Record<MethodologyMode, string> = { one: "One methodology for all", each: "One per portfolio" };

const id = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const portfolioSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  /** Account names as the book carries them (`holding.account`). */
  accounts: z.array(z.string().max(80)).max(40),
  /** This portfolio's own methodology, used when the mode is `each`; null until one is confirmed for it. */
  methodology: methodologySchema.nullable().default(null),
});
export type Portfolio = z.infer<typeof portfolioSchema>;

export const portfoliosFileSchema = z
  .object({
    version: z.literal(1),
    items: z.array(portfolioSchema).min(1).max(MAX_PORTFOLIOS),
    mode: z.enum(METHODOLOGY_MODES),
    updated: z.string(),
  })
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    const accounts = new Set<string>();
    for (const p of f.items) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `Two portfolios share the id ${p.id}.` });
      ids.add(p.id);
      for (const a of p.accounts) {
        if (accounts.has(a)) ctx.addIssue({ code: "custom", message: `The account ${a} is in two portfolios.` });
        accounts.add(a);
      }
    }
  });
export type PortfoliosFile = z.infer<typeof portfoliosFileSchema>;

/** A portfolio's id from its name: lower case, digits and dashes, unique among `taken`. */
export function portfolioId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "portfolio";
  let out = base;
  for (let n = 2; taken.includes(out); n++) out = `${base}-${n}`;
  return out;
}

/** The accounts the book carries, in the order they first appear. */
export function accountsOf(book: Book | null): string[] {
  const out: string[] = [];
  for (const h of book?.holdings ?? []) if (!out.includes(h.account)) out.push(h.account);
  for (const t of book?.transactions ?? []) if (!out.includes(t.account)) out.push(t.account);
  return out;
}

/** With no file: each account its own portfolio, named after it, under one methodology. */
export function defaultPortfolios(book: Book | null): PortfoliosFile {
  const items: Portfolio[] = [];
  for (const a of accountsOf(book).slice(0, MAX_PORTFOLIOS)) items.push({ id: portfolioId(a, items.map((p) => p.id)), name: a.slice(0, 40), accounts: [a], methodology: null });
  if (!items.length) items.push({ id: "main", name: "Main", accounts: [], methodology: null });
  return { version: 1, items, mode: "one", updated: "" };
}

/**
 * The file as it applies to today's book: an account the book carries that no
 * portfolio names joins the first portfolio, so a new account is never left
 * out of every view. Accounts named but no longer in the book stay named.
 */
export function withNewAccounts(file: PortfoliosFile, book: Book | null): PortfoliosFile {
  const named = new Set(file.items.flatMap((p) => p.accounts));
  const fresh = accountsOf(book).filter((a) => !named.has(a));
  if (!fresh.length) return file;
  return { ...file, items: file.items.map((p, i) => (i === 0 ? { ...p, accounts: [...p.accounts, ...fresh] } : p)) };
}

/**
 * One portfolio's part of the book: its holdings, their look-through rows and
 * its transactions. The account value series stays only when the portfolio is
 * exactly the accounts of the source that reported it (IBKR's statement for
 * its own accounts); otherwise it would be another portfolio's return, so it
 * is left out and Performance says it needs one. Benchmarks stay.
 */
export function scopeBook(book: Book, p: Portfolio): Book {
  const mine = new Set(p.accounts);
  const holdings = book.holdings.filter((h) => mine.has(h.account));
  const ids = new Set(holdings.map((h) => h.id));
  const navSource = book.series && /ibkr|interactive brokers/i.test(book.series.source) ? "ibkr" : null;
  const sourceAccounts = navSource ? new Set(book.holdings.filter((h) => h.source === navSource).map((h) => h.account)) : null;
  const navFits = !!sourceAccounts && sourceAccounts.size > 0 && sourceAccounts.size === mine.size && [...mine].every((a) => sourceAccounts.has(a));
  return {
    ...book,
    holdings,
    lookThrough: book.lookThrough.filter((r) => ids.has(r.parentId)),
    transactions: book.transactions.filter((t) => mine.has(t.account)),
    series: book.series ? { ...book.series, nav: navFits ? book.series.nav : [] } : undefined,
  };
}

export type Lens = { portfolio: Portfolio | null; methodology: Methodology | null; book: Book | null };

/** How a lens of several portfolios is kept: their ids joined, in the file's order. */
export const LENS_JOIN = ",";

/** The portfolio ids a kept lens names that the file still has, in the file's order; empty for all. */
export function lensIds(file: PortfoliosFile, lens: string | null): string[] {
  if (!lens) return [];
  const named = new Set(lens.split(LENS_JOIN));
  return file.items.filter((p) => named.has(p.id)).map((p) => p.id);
}

/**
 * The lens to keep for a choice of portfolios (Hamza, 19 Oct 2026: an
 * aggregate of all portfolios, or of the ones the person picks): null for
 * none or every one (all together), the id for one, the ids joined for
 * several. Ids the file does not have are dropped.
 */
export function lensFor(file: PortfoliosFile, ids: readonly string[]): string | null {
  const kept = file.items.filter((p) => ids.includes(p.id)).map((p) => p.id);
  if (!kept.length || kept.length === file.items.length) return null;
  return kept.join(LENS_JOIN);
}

/** Several portfolios seen as one: their accounts together, no methodology of their own, named by theirs. */
function aggregateOf(items: readonly Portfolio[]): Portfolio {
  return { id: items.map((p) => p.id).join(LENS_JOIN), name: items.map((p) => p.name).join(" + ").slice(0, 120), accounts: items.flatMap((p) => p.accounts), methodology: null };
}

const BROKER_LABEL: Partial<Record<Book["holdings"][number]["source"], string>> = { ibkr: "IBKR", etoro: "eToro" };

/**
 * A portfolio's name as the person reads it at the top of the page: the name
 * they gave it, or, while it still carries the account's own name (the
 * default, one account each), the owner's name and where it is held, such as
 * "Hamza's IBKR" (Hamza, 19 Oct 2026). A broker without a short name is
 * named by the account, as the book carries it.
 */
export function portfolioLabel(p: Portfolio, owner: string | null, book: Book | null): string {
  const isDefault = p.accounts.length === 1 && p.name === p.accounts[0].slice(0, 40);
  if (!isDefault || !owner) return p.name;
  const sources = [...new Set((book?.holdings ?? []).filter((h) => p.accounts.includes(h.account)).map((h) => h.source))];
  const where = sources.length === 1 && BROKER_LABEL[sources[0]] ? BROKER_LABEL[sources[0]]! : p.name;
  const first = owner.trim().split(/\s+/)[0];
  return `${first}${first.endsWith("s") ? "'" : "'s"} ${where}`;
}

/**
 * What the screens see through a lens: all portfolios together (`lens` null
 * or unknown) or one. Under one methodology it applies to every view. Under
 * one per portfolio, a portfolio's view takes its own, and the combined view
 * takes none: its figures carry no verdict, and each portfolio's breaches are
 * read under its own name (`perPortfolio`). A lens of several portfolios
 * (`lensFor`) is their accounts together, under the shared methodology when
 * there is one, else none, as the whole is.
 */
export function lensView(file: PortfoliosFile, lens: string | null, shared: Methodology | null, book: Book | null): Lens {
  const ids = file.items.length > 1 ? lensIds(file, lens) : [];
  const chosen = file.items.filter((p) => ids.includes(p.id));
  const portfolio = chosen.length === 1 ? chosen[0] : chosen.length > 1 && chosen.length < file.items.length ? aggregateOf(chosen) : null;
  const methodology = file.mode === "one" ? shared : portfolio ? portfolio.methodology : null;
  return { portfolio, methodology, book: book && portfolio ? scopeBook(book, portfolio) : book };
}

/** Each portfolio with its own book and methodology, for the combined view's per-portfolio reading. */
export function perPortfolio(file: PortfoliosFile, shared: Methodology | null, book: Book): { portfolio: Portfolio; methodology: Methodology | null; book: Book }[] {
  return file.items.map((p) => ({ portfolio: p, methodology: file.mode === "one" ? shared : p.methodology, book: scopeBook(book, p) }));
}

/** The file with one account moved to another portfolio; it leaves wherever it was. */
export function moveAccount(file: PortfoliosFile, account: string, to: string): PortfoliosFile {
  if (!file.items.some((p) => p.id === to)) return file;
  return { ...file, items: file.items.map((p) => ({ ...p, accounts: p.id === to ? [...p.accounts.filter((a) => a !== account), account] : p.accounts.filter((a) => a !== account) })) };
}

/** The file with a new, empty portfolio. */
export function addPortfolio(file: PortfoliosFile, name: string): PortfoliosFile {
  if (file.items.length >= MAX_PORTFOLIOS) return file;
  const nm = name.trim().slice(0, 40);
  return { ...file, items: [...file.items, { id: portfolioId(nm, file.items.map((p) => p.id)), name: nm, accounts: [], methodology: null }] };
}

/** The file without a portfolio; its accounts go to the first one left. The last portfolio stays. */
export function removePortfolio(file: PortfoliosFile, id: string): PortfoliosFile {
  const gone = file.items.find((p) => p.id === id);
  if (!gone || file.items.length === 1) return file;
  const rest = file.items.filter((p) => p.id !== id);
  return { ...file, items: rest.map((p, i) => (i === 0 ? { ...p, accounts: [...p.accounts, ...gone.accounts] } : p)) };
}

export function renamePortfolio(file: PortfoliosFile, id: string, name: string): PortfoliosFile {
  const nm = name.trim().slice(0, 40);
  if (!nm) return file;
  return { ...file, items: file.items.map((p) => (p.id === id ? { ...p, name: nm } : p)) };
}

/** The file with one portfolio's own methodology set or cleared. */
export function withPortfolioMethodology(file: PortfoliosFile, id: string, m: Methodology | null): PortfoliosFile {
  return { ...file, items: file.items.map((p) => (p.id === id ? { ...p, methodology: m } : p)) };
}
