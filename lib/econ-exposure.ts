/**
 * What a calendar event touches in the person's book, under their own
 * methodology (Hamza, 27 Oct 2026: "it should be shown how each event
 * affects the portfolio as per the user methodology"). The app's arithmetic
 * alone, never a forecast of the event or of a price: the share of the book's
 * revenue its holdings report in the economy the event decides, the share of
 * the book held in that economy's currency, and the methodology's own rules
 * and figures that read an indicator the event moves. A revenue line naming a
 * wider region (Europe, EMEA) is counted apart, since the filing does not say
 * how much of it is the country itself.
 *
 * Pure.
 */
import { ECON_EVENTS, reachKey, type EconArea, type EconEvent, type EconKind } from "@/lib/econ-calendar";
import { ownerValue, revenueByGeography } from "@/lib/exposure";
import type { Book } from "@/lib/holdings";
import { marketSymbolsIn, type MarketSymbol } from "@/lib/markets";
import { termsOf, type Methodology } from "@/lib/methodology";
import { addDaysTo } from "@/lib/time";

type AreaDef = { label: string; currency: string; exact: RegExp; wider: RegExp | null };

export const ECON_AREAS: Record<EconArea, AreaDef> = {
  us: { label: "the United States", currency: "USD", exact: /united states|^u\.?s\.?a?\.?$|^us\b|u\.s\. and canada|us and canada|north america/i, wider: /^americas$|^the americas$/i },
  euro: { label: "the euro area", currency: "EUR", exact: /euro area|eurozone|euro zone|germany|france|netherlands|ireland|spain|italy|belgium|austria|finland|luxembourg|portugal|greece/i, wider: /europe|emea/i },
  uk: { label: "the United Kingdom", currency: "GBP", exact: /united kingdom|^uk$|britain|england/i, wider: /europe|emea/i },
  japan: { label: "Japan", currency: "JPY", exact: /japan/i, wider: /asia|pacific|apac/i },
  canada: { label: "Canada", currency: "CAD", exact: /canada/i, wider: /^americas$|north america|^the americas$/i },
  switzerland: { label: "Switzerland", currency: "CHF", exact: /switzerland|swiss/i, wider: /europe|emea/i },
  france: { label: "France", currency: "EUR", exact: /france|french/i, wider: /europe|emea/i },
  mexico: { label: "Mexico", currency: "MXN", exact: /mexico/i, wider: /latin america|^americas$|north america|^the americas$/i },
  israel: { label: "Israel", currency: "ILS", exact: /israel/i, wider: /middle east|emea/i },
  china: { label: "China", currency: "CNY", exact: /china|greater china|mainland|hong kong/i, wider: /asia|pacific|apac/i },
  world: { label: "the world economy", currency: "", exact: /^$/, wider: null },
  argentina: { label: "Argentina", currency: "ARS", exact: /argentina/i, wider: /latin america|south america|^americas$|^the americas$/i },
};

/** The indicators an event moves, whose readings a methodology's figures can test. */
export const EVENT_READS: Record<EconKind, readonly MarketSymbol[]> = {
  fomc: ["EFFR", "SOFR", "US3M", "US2Y", "US10Y", "US10Y2Y", "US10Y3M", "MORT30", "FEDBS", "DXY"],
  cpi: ["CPIYOY", "US2Y", "US10Y"],
  ppi: ["CPIYOY", "US2Y"],
  pce: ["CPIYOY", "US2Y"],
  jobs: ["UNRATE", "RECPROB", "US2Y"],
  jolts: ["UNRATE", "RECPROB"],
  gdp: ["RECPROB", "US10Y"],
  ecb: ["DXY", "DAX", "DM", "DMXUS"],
  boe: ["DXY", "FTSE", "DM", "DMXUS"],
  boj: ["DXY", "N225", "DM", "DMXUS"],
  boc: ["DXY"],
  snb: ["DXY"],
  election: [],
  summit: ["VIX", "DXY", "GOLD", "WTI"],
  opec: ["WTI"],
  deadline: ["VIX", "US3M", "US10Y", "DXY", "SSEC"],
  earnings: [],
};

export type EventRule = { section: string; text: string; severity: string };
export type EventFigure = { label: string; reads: string[] };

export type EventReach = {
  /** An event of no one economy (a summit, OPEC+): read only through the methodology. */
  global: boolean;
  area: string;
  /** Share of the book, 0 to 1, in revenue lines naming the economy itself, with the holdings that report them. */
  revenue: { share: number; symbols: string[]; lines: string[] };
  /** Share of the book in lines naming a wider region that includes it. */
  wider: { share: number; symbols: string[]; lines: string[] };
  /** Share of the book held in the economy's currency. */
  currency: { code: string; share: number; symbols: string[] };
  /** Share of the book whose holdings report no revenue split. */
  unsplit: number;
  /** The methodology's figures that read an indicator the event moves, and the rules that test them. */
  figures: EventFigure[];
  rules: EventRule[];
};


/** What one kind of event in one economy touches in the book. */
export function eventReach(kind: EconKind, area: EconArea, book: Book, m: Methodology | null): EventReach {
  const def = ECON_AREAS[area];
  const g = revenueByGeography(book);
  const sum = (places: typeof g.places) => ({
    share: places.reduce((s, p) => s + p.share, 0),
    symbols: [...new Set(places.flatMap((p) => p.symbols))],
    lines: places.map((p) => p.name),
  });
  const global = area === "world";
  const exact = global ? [] : g.places.filter((p) => def.exact.test(p.name.trim()));
  const wider = def.wider ? g.places.filter((p) => !exact.includes(p) && def.wider!.test(p.name.trim())) : [];
  const total = book.holdings.reduce((s, h) => s + ownerValue(h, book), 0);
  const inCcy = global ? [] : book.holdings.filter((h) => h.currency.toUpperCase() === def.currency);
  const reads = new Set<string>(EVENT_READS[kind]);
  const figures: EventFigure[] = [];
  for (const f of m?.figures ?? []) {
    const symbols = [...new Set(termsOf(f).flatMap((t) => marketSymbolsIn(t.where)))].filter((s) => reads.has(s));
    if (symbols.length) figures.push({ label: f.label, reads: symbols });
  }
  const ids = new Set((m?.figures ?? []).filter((f) => figures.some((x) => x.label === f.label)).map((f) => f.id));
  const rules = (m?.rules ?? []).filter((r) => r.test && ids.has(r.test.figure)).map((r) => ({ section: r.section, text: r.text, severity: r.severity }));
  return {
    global,
    area: def.label,
    revenue: sum(exact),
    wider: sum(wider),
    currency: { code: def.currency, share: total ? inCcy.reduce((s, h) => s + ownerValue(h, book), 0) / total : 0, symbols: [...new Set(inCcy.map((h) => h.symbol.toUpperCase()))] },
    unsplit: g.rest.share,
    figures,
    rules,
  };
}

/** Each kind and economy the events name, read once: what the calendar hands its screen. */
export function eventReaches(events: readonly EconEvent[], book: Book | null, m: Methodology | null): Record<string, EventReach> {
  const out: Record<string, EventReach> = {};
  if (!book) return out;
  for (const e of events) {
    if (e.kind === "earnings") continue;
    const k = reachKey(e);
    if (!(k in out)) out[k] = eventReach(e.kind, e.area, book, m);
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(x * 100 < 10 ? 1 : 0)}%`;

/** The reach as sentences, for the calendar's day and the alert. */
export function reachWords(r: EventReach): string[] {
  const out: string[] = [];
  if (r.global) return [...methodologyWords(r)];
  if (r.revenue.share > 0.0005) out.push(`${pct(r.revenue.share)} of your book is revenue your holdings report in ${r.area} (${r.revenue.symbols.join(", ")}).`);
  else out.push(`Your holdings report no revenue line naming ${r.area}.`);
  if (r.wider.share > 0.0005) out.push(`${pct(r.wider.share)} more is in lines naming a wider region that includes it (${r.wider.lines.slice(0, 3).join(", ")}), which the filings do not split.`);
  if (r.currency.share > 0.0005) out.push(`${pct(r.currency.share)} of the book is held in ${r.currency.code} (${r.currency.symbols.slice(0, 6).join(", ")}${r.currency.symbols.length > 6 ? ", ..." : ""}).`);
  if (r.unsplit > 0.0005) out.push(`${pct(r.unsplit)} of the book has no revenue split in its filings, so it is not counted.`);
  return [...out, ...methodologyWords(r)];
}

function methodologyWords(r: EventReach): string[] {
  if (r.rules.length) return [`Your methodology tests what it moves: ${r.rules.map((x) => `${x.section}, ${x.text}`).join("; ")}.`];
  if (r.figures.length) return [`Your methodology reads what it moves in ${r.figures.map((f) => f.label).join(", ")}, with no rule on it.`];
  return ["Your methodology has no figure on the indicators it moves."];
}

/** The reach, as sentences, of the events of today and tomorrow: what their alerts carry. */
export function econReachWords(today: string, book: Book | null, m: Methodology | null, events: readonly EconEvent[] = ECON_EVENTS): Record<string, string[]> {
  const soon = events.filter((e) => e.date >= today && e.date <= addDaysTo(today, 1));
  return Object.fromEntries(Object.entries(eventReaches(soon, book, m)).map(([k, r]) => [k, reachWords(r)]));
}
