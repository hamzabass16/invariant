/**
 * The search palette (⌘K; Hamza, 4 Nov 2026): a ticker, a screen or a rule,
 * typed and opened. Screens are the person's own menu; rules are the
 * methodology's, each opening Methodology at that rule; tickers are the
 * holdings, the watchlist and the companies traded, each opening its company
 * page. Anything else falls through to the Companies search
 * (`/companies?q=`, matched there against the SEC's list). Matched in the
 * browser, sent nowhere; no amount is ever part of an entry. Pure.
 */

import { sectionMark } from "@/lib/cite";

export type PaletteKind = "screen" | "rule" | "ticker" | "search";

/** One thing the palette can open. `words` is what is matched beside the label. */
export type PaletteEntry = { kind: PaletteKind; key: string; label: string; detail: string; href: string; words?: string };

export type PaletteSources = { screens: readonly PaletteEntry[]; rules: readonly PaletteEntry[]; tickers: readonly PaletteEntry[] };

/** At most this many of each kind are listed for a query. */
export const PALETTE_PER_KIND = 6;
/** The words typed are cut to this length, as the Companies search cuts them. */
export const PALETTE_MAX_QUERY = 60;

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** A watchlist or traded symbol the SEC could list: letters first, no spaces, no ISIN. */
export function isTicker(s: string): boolean {
  return TICKER.test(s);
}

/** The Companies search for the words typed, the only address a query is put in. */
export function companiesSearchHref(q: string): string {
  return `/companies?q=${encodeURIComponent(q.trim().slice(0, PALETTE_MAX_QUERY))}`;
}

/** How well an entry matches the words typed: 0 when it does not. */
export function scoreOf(e: PaletteEntry, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return e.kind === "screen" ? 1 : 0;
  const label = e.label.toLowerCase();
  const words = `${e.detail} ${e.words ?? ""}`.toLowerCase();
  if (e.kind === "ticker" && label === query) return 100;
  if (label === query) return 90;
  if (label.startsWith(query)) return e.kind === "ticker" ? 80 : 70;
  if (label.split(/[\s§.&,()-]+/).some((w) => w.startsWith(query))) return 60;
  if (label.includes(query)) return 50;
  if (words.split(/[\s§.&,()-]+/).some((w) => w.startsWith(query))) return 30;
  if (words.includes(query)) return 20;
  return 0;
}

/**
 * What the palette lists for the words typed: the screens, the tickers and
 * the rules that match, best first, at most `PALETTE_PER_KIND` of each; then,
 * for any words, the Companies search for them, unless a ticker matched
 * exactly. With nothing typed, the screens alone.
 */
export function paletteResults(q: string, src: PaletteSources): PaletteEntry[] {
  const query = q.trim().slice(0, PALETTE_MAX_QUERY);
  const pick = (list: readonly PaletteEntry[]) =>
    list
      .map((e, i) => ({ e, i, s: scoreOf(e, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, query ? PALETTE_PER_KIND : list.length)
      .map((x) => x.e);
  if (!query) return pick(src.screens);
  const tickers = pick(src.tickers);
  const out = [...tickers, ...pick(src.screens), ...pick(src.rules)];
  const exact = tickers.some((t) => t.label.toLowerCase() === query.toLowerCase());
  if (!exact) out.push({ kind: "search", key: `search:${query}`, label: `Search companies for “${query}”`, detail: "Every company that files with the SEC, by ticker or name", href: companiesSearchHref(query) });
  return out;
}

/** A rule as the palette needs it: its id, section and words, and whether the app tests it. */
export type PaletteRule = { id: string; section: string; text: string; tested: string | null };

/**
 * The methodology's rules as entries, each opening Methodology at that rule:
 * in the Checks view when the book is read against it, else in Rules.
 */
export function ruleEntries(rules: readonly PaletteRule[], view: "checks" | "rules"): PaletteEntry[] {
  return rules.map((r) => ({ kind: "rule", key: `rule:${r.id}`, label: r.text, detail: `${sectionMark(r.section)} · ${r.tested ?? "Yours to check"}`, href: `/methodology?view=${view}#rule-${encodeURIComponent(r.id)}`, words: `§${r.section} ${r.section}` }));
}

/**
 * The tickers as entries, each opening its company page (`href` from
 * `companyHref`): held first, then watched, then traded, each once, with the
 * name where one is known. Symbols only; no weight, no amount.
 */
export function tickerEntries(held: readonly string[], watched: readonly string[], traded: readonly string[], names: ReadonlyMap<string, string>, href: (symbol: string) => string): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  const add = (list: readonly string[], where: string) => {
    for (const raw of list) {
      const s = raw.toUpperCase();
      if (seen.has(s) || !isTicker(s)) continue;
      seen.add(s);
      const name = names.get(s);
      out.push({ kind: "ticker", key: `ticker:${s}`, label: s, detail: name && name !== s ? `${name} · ${where}` : where, href: href(s), words: name ?? "" });
    }
  };
  add(held, "Held");
  add(watched, "Watched");
  add(traded, "Traded before");
  return out;
}
