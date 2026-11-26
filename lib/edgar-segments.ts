/**
 * The disruption engine, read from the filing itself. SEC company facts carry
 * no segment lines (they drop every dimensional fact), so the segment note and
 * the revenue disaggregation table are read from the XBRL instance of the
 * latest 10-Q, 10-K, 20-F or 40-F: each revenue fact that carries one
 * explicit member on a segment or product axis is a line, in the filing's own
 * currency, for the filing's own period against the same period a year
 * before. The same instance, of the latest annual filing, gives revenue by
 * geography (geographyRead). Pure: lib/edgar.ts fetches the submissions
 * index, the filing index and the instance; nothing here estimates, and a
 * line the filing does not give is not there.
 */
import { z } from "zod";

import type { Fundamentals } from "@/lib/edgar-facts";
import type { RevenueGeography } from "@/lib/holdings";

// ---------------------------------------------------------------------------
// Which filing, and which file in it

export type LatestFiling = { accession: string; form: string; reportDate: string | null; filingDate: string | null };

/** The forms whose instance carries a segment note; amendments and 8-Ks do not. */
export const ENGINE_FORMS = ["10-Q", "10-K", "20-F", "40-F"] as const;

const recentSchema = z
  .object({
    filings: z.object({ recent: z.object({ accessionNumber: z.array(z.string()), form: z.array(z.string()), reportDate: z.array(z.string()).optional(), filingDate: z.array(z.string()).optional() }).loose() }).loose(),
  })
  .loose();

/** The newest `max` 10-Q, 10-K, 20-F or 40-F filings in a submissions document (newest first there), the latest first; throws when the shape is not that document. */
export function periodicFilingsOf(json: unknown, max = 2): LatestFiling[] {
  const r = recentSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const { accessionNumber, form, reportDate, filingDate } = r.data.filings.recent;
  const out: LatestFiling[] = [];
  for (let i = 0; i < form.length && out.length < max; i++) {
    if (!(ENGINE_FORMS as readonly string[]).includes(form[i])) continue;
    out.push({ accession: accessionNumber[i].replace(/-/g, ""), form: form[i], reportDate: reportDate?.[i] || null, filingDate: filingDate?.[i] || null });
  }
  return out;
}

/** The latest 10-Q, 10-K, 20-F or 40-F in a submissions document; null when it lists none. */
export function latestFilingOf(json: unknown): LatestFiling | null {
  return periodicFilingsOf(json, 1)[0] ?? null;
}

const indexSchema = z.object({ directory: z.object({ item: z.array(z.object({ name: z.string() }).loose()) }).loose() }).loose();

/** The XBRL instance in a filing's index.json: the `_htm.xml` the SEC extracts from inline XBRL, else a plain `name-YYYYMMDD.xml`; null when there is none. */
export function instanceFileOf(json: unknown): string | null {
  const r = indexSchema.safeParse(json);
  if (!r.success) throw new Error("not a filing index");
  const names = r.data.directory.item.map((i) => i.name);
  return names.find((n) => /_htm\.xml$/i.test(n)) ?? names.find((n) => /^[a-z0-9]+-\d{8}\.xml$/i.test(n)) ?? null;
}

// ---------------------------------------------------------------------------
// The instance: contexts, revenue facts, lines

/** Revenue concepts, in the order a total is preferred. */
const REVENUE_CONCEPTS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "Revenue", "RevenueFromContractsWithCustomers"] as const;
/** Axes whose members are a reported segment or a disclosed revenue line (D.1(a), C3); IFRS's own for a 20-F or 40-F filer (27 Oct 2026: SPOT's Premium and Ad-Supported read as none). */
const LINE_AXES = ["us-gaap:StatementBusinessSegmentsAxis", "srt:ProductOrServiceAxis", "us-gaap:ProductOrServiceAxis", "srt:SegmentsAxis", "ifrs-full:SegmentsAxis", "ifrs-full:ProductsAndServicesAxis"] as const;
/** Dimensions that qualify a segment fact without changing what it is. */
const NEUTRAL = new Set(["srt:ConsolidationItemsAxis", "us-gaap:ConsolidationItemsAxis", "ifrs-full:SegmentConsolidationItemsAxis"]);
/** Members that are not a line: eliminations, corporate, reconciling items, "all other". */
const NOT_A_LINE = /Elimination|Intersegment|Corporate|AllOther|Reconcil|Consolidat|Total|Unallocated|Matter(Member)?$|Settlement|Litigation|Lawsuit/i;
/** Installed-base vocabulary: C3(a) excludes service, maintenance, upgrades and parts for the company's own installed base. */
const INSTALLED_BASE = /InstalledBase|Maintenance|Upgrade|Parts|Aftermarket|Servicing/i;

type Context = { id: string; start: string | null; end: string; dims: { axis: string; member: string }[] };

function contexts(xml: string): Map<string, Context> {
  const out = new Map<string, Context>();
  const re = /<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[2];
    const end = /<(?:xbrli:)?endDate>\s*([\d-]+)\s*</.exec(body)?.[1] ?? /<(?:xbrli:)?instant>\s*([\d-]+)\s*</.exec(body)?.[1];
    if (!end) continue;
    const start = /<(?:xbrli:)?startDate>\s*([\d-]+)\s*</.exec(body)?.[1] ?? null;
    const dims: Context["dims"] = [];
    const dre = /<(?:xbrldi:)?explicitMember[^>]*\bdimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g;
    for (let d = dre.exec(body); d; d = dre.exec(body)) dims.push({ axis: d[1], member: d[2] });
    // A typed member (a named customer, a contract) is a dimension too; the context is then not a line or a total.
    if (/<(?:xbrldi:)?typedMember\b/.test(body)) dims.push({ axis: "typed", member: "typed" });
    out.set(m[1], { id: m[1], start, end, dims });
  }
  return out;
}

type Fact = { concept: string; contextRef: string; value: number };

function revenueFacts(xml: string): Fact[] {
  const out: Fact[] = [];
  const re = new RegExp(`<(?:us-gaap|ifrs-full):(${REVENUE_CONCEPTS.join("|")})\\b([^>]*)>\\s*(-?[\\d.]+)\\s*<`, "g");
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const ref = /\bcontextRef="([^"]+)"/.exec(m[2])?.[1];
    if (!ref || /\bxsi:nil="true"/.test(m[2])) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    out.push({ concept: m[1], contextRef: ref, value });
  }
  return out;
}

/**
 * Words a filer runs together in a member's name ("Advertisingandotherrevenues"),
 * enough to split such a run only when every part of it is one of them; a run
 * they cannot wholly spell is left as filed.
 */
const GLUED_WORDS = new Set(
  "and or of the for from with other others all revenue revenues sales sale services service products product fees fee income advertising merchant agency licensing license licenses subscription subscriptions membership memberships hardware software cloud data center centers gaming automotive financial payment payments transaction transactions interest net rental rentals retail wholesale international domestic commercial consumer enterprise digital media content platform platforms marketplace travel insurance equipment systems solutions support maintenance devices device wearables home accessories physical online stores store third party seller sellers brand brands royalty royalties technology health care energy professional managed private public network networks security premium partner partners direct indirect search display video music games game hotel hotels car cars air flights restaurant food delivery mobility ads ad commission commissions installation contract contracts research development"
    .split(" "),
);

function unglue(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 12 || !/^[a-z]+$/.test(w)) return word;
  // The fewest words that spell the run, every one known.
  const best: (string[] | null)[] = [[]];
  for (let i = 1; i <= w.length; i++) {
    best[i] = null;
    for (let j = Math.max(0, i - 14); j < i; j++) {
      const prev = best[j];
      if (prev && GLUED_WORDS.has(w.slice(j, i)) && (!best[i] || prev.length + 1 < best[i]!.length)) best[i] = [...prev, w.slice(j, i)];
    }
  }
  const parts = best[w.length];
  if (!parts || parts.length < 2) return word;
  const out = parts.join(" ");
  return word[0] === word[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

/** "amzn:AmazonWebServicesSegmentMember" in words: "Amazon Web Services"; "bkng:AdvertisingandotherrevenuesMember": "Advertising and other revenues". */
export function memberName(member: string): string {
  return member
    .replace(/^[^:]+:/, "")
    .replace(/(Segment)?Member$/, "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map(unglue)
    .join(" ");
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export type SegmentLine = {
  name: string;
  axis: string;
  member: string;
  /** Revenue in the period, in the filing's currency units as filed. */
  value: number;
  /** The same period a year before; null when the filing does not give it. */
  prior: number | null;
  growthPct: number | null;
  /** Share of company revenue in the period; null when the filing gives no undimensioned total. */
  sharePct: number | null;
  /** Why the line is not an engine candidate under C3(a), when it is not. */
  excluded: string | null;
  /** What the line's axis splits revenue by (lineKinds): a business segment, a product or service, a place, or a mix of places and businesses that is neither split. */
  kind: LineKind;
};

export type SegmentRead = {
  form: string;
  /** The period read, in words ("quarter to 2026-06-30", "year to 2025-12-31"). */
  period: string;
  periodEnd: string;
  /** The period's length in days, as filed. */
  periodDays: number;
  /** Company revenue in the period from an undimensioned fact; null when the instance has none. */
  totalRevenue: number | null;
  lines: SegmentLine[];
  /** Set when the lines come from an earlier filing than the latest, with why: the failover inside EDGAR. */
  fallback: string | null;
};

/** The length of a period in words. */
function periodWords(d: number, end: string): string {
  return `${d <= 100 ? "quarter" : d <= 200 ? "half-year" : d <= 290 ? "nine months" : "year"} to ${end}`;
}

/**
 * Every segment and revenue line of the instance for its latest period (a
 * quarter when the filing has one, else the year), with the same period a
 * year before and the undimensioned company total. Null when the instance
 * has no revenue fact on a segment or product axis; throws when the text is
 * not an XBRL instance.
 */
export function segmentRead(xml: string, form: string): SegmentRead | null {
  if (!/<(?:xbrli:)?context\b/.test(xml)) throw new Error("not an XBRL instance: no contexts");
  const ctx = contexts(xml);
  const facts = revenueFacts(xml).map((f) => ({ ...f, c: ctx.get(f.contextRef) })).filter((f): f is Fact & { c: Context } => !!f.c && f.c.start !== null);
  type Keyed = Fact & { c: Context; key: string; axis: string; member: string };
  const lines: Keyed[] = [];
  const totals: (Fact & { c: Context })[] = [];
  for (const f of facts) {
    const dims = f.c.dims.filter((d) => !(NEUTRAL.has(d.axis) && /OperatingSegmentsMember$/.test(d.member)));
    if (f.c.dims.length === 0) totals.push(f);
    else if (dims.length === 1 && (LINE_AXES as readonly string[]).includes(dims[0].axis) && !NOT_A_LINE.test(dims[0].member)) lines.push({ ...f, key: `${dims[0].axis}|${dims[0].member}`, axis: dims[0].axis, member: dims[0].member });
  }
  if (!lines.length) return null;
  // The period: the latest end date any line reports, at the shortest length filed for it (the quarter in a 10-Q, the year in a 10-K).
  const periodEnd = lines.map((l) => l.c.end).sort().at(-1)!;
  const atEnd = lines.filter((l) => l.c.end === periodEnd);
  const periodDays = Math.min(...atEnd.map((l) => days(l.c.start!, l.c.end)));
  const same = (l: { c: Context }, end: string, d: number) => Math.abs(days(l.c.start!, l.c.end) - d) <= 10 && Math.abs(days(end, l.c.end)) <= 20;
  const priorEnd = `${Number(periodEnd.slice(0, 4)) - 1}${periodEnd.slice(4)}`;
  const total = (end: string) => {
    for (const concept of REVENUE_CONCEPTS) {
      const t = totals.find((f) => f.concept === concept && same(f, end, periodDays));
      if (t) return t.value;
    }
    return null;
  };
  const totalRevenue = total(periodEnd);
  const byKey = new Map<string, Keyed[]>();
  for (const l of lines) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
  const out: SegmentLine[] = [];
  for (const [, ls] of byKey) {
    // One concept per line: the one the current period uses.
    const now = ls.find((l) => same(l, periodEnd, periodDays));
    if (!now) continue;
    const prior = ls.find((l) => l.concept === now.concept && same(l, priorEnd, periodDays)) ?? null;
    const name = memberName(now.member);
    out.push({
      name,
      axis: now.axis,
      member: now.member,
      value: now.value,
      prior: prior?.value ?? null,
      growthPct: prior && prior.value > 0 ? ((now.value - prior.value) / prior.value) * 100 : null,
      sharePct: totalRevenue && totalRevenue > 0 ? (now.value / totalRevenue) * 100 : null,
      excluded: INSTALLED_BASE.test(now.member) ? "installed-base service line (C3(a))" : null,
      kind: "segment",
    });
  }
  if (!out.length) return null;
  const kinds = lineKinds(out);
  for (const l of out) l.kind = kinds.get(l.axis) ?? familyOf(l.axis);
  // Segments first, then product lines; the largest first within each.
  out.sort((a, b) => (a.axis === b.axis ? b.value - a.value : a.axis.includes("Segments") ? -1 : 1));
  return { form, period: periodWords(periodDays, periodEnd), periodEnd, periodDays, totalRevenue, lines: out, fallback: null };
}

// ---------------------------------------------------------------------------
// Revenue by segment over time (Hamza, 4 Nov 2026, after Qualtrim: "see in
// the revenue chart each segment of revenue ... as a percentage of the whole
// bar")

/**
 * The three families a line can come from, never mixed in one split (Hamza,
 * 5 Nov 2026: "geographic segments mixed with product and services segments
 * ... two different sets of inputs for the graphs and pie charts"): the
 * reported business segments, the products and services the revenue note
 * breaks out, and the places revenue is earned in.
 */
export const SEGMENT_FAMILIES = ["segment", "product", "geography"] as const;
export type SegmentFamily = (typeof SEGMENT_FAMILIES)[number];
const familyOf = (axis: string): "segment" | "product" => (/Segments?Axis$/.test(axis) ? "segment" : "product");

/** What a line splits revenue by: `place` for an axis whose members are all places (MercadoLibre's countries, Birkenstock's regions), `mixed` for one that holds places and businesses together (Amazon's North America, International and AWS), else its axis's family. */
export type LineKind = "segment" | "product" | "place" | "mixed";
export const LINE_KINDS = ["segment", "product", "place", "mixed"] as const;

/** Each axis's kind from every member the filing puts on it. */
export function lineKinds(lines: readonly { axis: string; member: string }[]): Map<string, LineKind> {
  const byAxis = new Map<string, Set<string>>();
  for (const l of lines) byAxis.set(l.axis, (byAxis.get(l.axis) ?? new Set()).add(l.member));
  const out = new Map<string, LineKind>();
  for (const [axis, members] of byAxis) {
    const places = [...members].filter(isPlace).length;
    out.set(axis, (GEO_AXES as readonly string[]).includes(axis) || places === members.size ? "place" : places > 0 ? "mixed" : familyOf(axis));
  }
  return out;
}

/** Whether a line's name, as memberName or placeOf writes it, names a place; for lines kept before their kind was. */
export function isPlaceName(name: string): boolean {
  const words = name.trim();
  if (!words) return false;
  const alias = PLACE_ALIASES[words.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()];
  return isCountryName(alias ?? words) || PLACE_WORDS.test(words) || Object.values(PLACE_MEMBERS).includes(words);
}

/** The lines of one split of revenue, never a mix: the business segments when they are a split of their own, else the products and services; never a place. Lines kept before their kind was are told apart by their names, then cut where their shares pass the whole. */
export function businessLines<L extends { name: string; sharePct: number | null; kind?: LineKind | null }>(lines: readonly L[]): { kind: "segment" | "product" | "line"; lines: L[] } | null {
  if (lines.some((l) => l.kind)) {
    for (const kind of ["segment", "product"] as const) {
      const ls = lines.filter((l) => l.kind === kind);
      if (ls.length >= 2) return { kind, lines: ls };
    }
    return null;
  }
  const named = lines.filter((l) => !isPlaceName(l.name));
  // Segments come before product lines in the kept order; a second split starts where the shares pass the whole.
  const kept: L[] = [];
  let sum = 0;
  for (const l of named) {
    if (l.sharePct !== null && sum + l.sharePct > 100 * (1 + GEO_TOLERANCE)) break;
    kept.push(l);
    sum += l.sharePct ?? 0;
  }
  return kept.length >= 2 ? { kind: "line", lines: kept } : null;
}

/** Quarters and years kept, newest last; the lines in a period, at most. */
export const SEGMENT_QUARTERS = 8;
export const SEGMENT_YEARS = 5;
export const SEGMENT_MAX_LINES = 10;

export const segmentPeriodSchema = z.object({
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The company's revenue in the period from an undimensioned fact; null when the filing gives none. */
  total: z.number().nullable(),
  lines: z.array(z.object({ name: z.string().max(80), value: z.number() })).max(SEGMENT_MAX_LINES * 2),
  /** A fourth quarter is the year less its first three quarters, which no filing prints by itself; said so. */
  derived: z.boolean().default(false),
});
export type SegmentPeriod = z.infer<typeof segmentPeriodSchema>;

const familySeriesSchema = z.object({ quarters: z.array(segmentPeriodSchema).max(SEGMENT_QUARTERS), years: z.array(segmentPeriodSchema).max(SEGMENT_YEARS) });
/** The read's own version: a history kept under an earlier one is read again from the filings (2: places taken out of the segments and products into their own family; 3: names a filer ran together split into words, and a legal matter on the product axis no line, 6 Nov 2026). */
export const SEGMENT_HISTORY_VERSION = 3;
/** The version from which a kept history has its places in a family of their own. */
const SEPARATED_SINCE = 2;
export const segmentHistorySchema = z.object({
  segment: familySeriesSchema.nullable(),
  product: familySeriesSchema.nullable(),
  /** Revenue by place over time, from the geographic axes and from segments that are all places. */
  geography: familySeriesSchema.nullable().default(null),
  /** The filings read, so an unchanged list is not read again. */
  accessions: z.array(z.string().max(25)).max(8),
  /** The filing's own currency, as its facts carry it. */
  currency: z.string().max(3).nullable(),
  readAt: z.string().max(30),
  note: z.string().max(300).nullable().default(null),
  version: z.number().int().default(1),
});
export type SegmentHistory = z.infer<typeof segmentHistorySchema>;
export type FamilySeries = z.infer<typeof familySeriesSchema>;

type RawPeriod = { end: string; kind: "quarter" | "year"; total: number | null; lines: Map<string, number> };
export type SegmentSeriesRead = {
  family: Record<SegmentFamily, RawPeriod[]>;
  currency: string | null;
  /** The lines of each axis that mixes places with businesses, in words; drawn in no family. */
  mixed: string[][];
};

const kindOfDays = (d: number): "quarter" | "year" | null => (d >= 80 && d <= 100 ? "quarter" : d >= 350 && d <= 380 ? "year" : null);

/**
 * Every quarter and every year an instance gives revenue for on a segment,
 * product or geographic axis, with the company total for each: a 10-Q
 * carries its quarter and the same quarter a year before, a 10-K its three
 * years. Half-years and nine months are left out. An axis whose members are
 * all places is geography whatever its name (lineKinds); one that mixes
 * places with businesses is no split and is named in `mixed`. A geography
 * period keeps the lines that add up to revenue (reconcileGeography), never
 * a country beside the region holding it. Throws when the text is not an
 * XBRL instance.
 */
export function segmentSeriesOf(xml: string): SegmentSeriesRead {
  if (!/<(?:xbrli:)?context\b/.test(xml)) throw new Error("not an XBRL instance: no contexts");
  const ctx = contexts(xml);
  const currency = /<(?:xbrli:)?measure>\s*iso4217:([A-Z]{3})\s*</.exec(xml)?.[1] ?? null;
  const facts = revenueFacts(xml).map((f) => ({ ...f, c: ctx.get(f.contextRef) })).filter((f): f is Fact & { c: Context } => !!f.c && f.c.start !== null);
  const totals = new Map<string, { concept: string; value: number }>();
  const rank = (c: string) => REVENUE_CONCEPTS.indexOf(c as (typeof REVENUE_CONCEPTS)[number]);
  type Raw = { key: string; end: string; kind: "quarter" | "year"; axis: string; member: string; concept: string; value: number };
  const raws: Raw[] = [];
  for (const f of facts) {
    const kind = kindOfDays(days(f.c.start!, f.c.end));
    if (!kind) continue;
    const key = `${kind}|${f.c.end}`;
    if (f.c.dims.length === 0) {
      const had = totals.get(key);
      if (!had || rank(f.concept) < rank(had.concept)) totals.set(key, { concept: f.concept, value: f.value });
      continue;
    }
    const dims = f.c.dims.filter((d) => !(NEUTRAL.has(d.axis) && /OperatingSegmentsMember$/.test(d.member)));
    if (dims.length === 1 && (LINE_AXES as readonly string[]).includes(dims[0].axis) && !NOT_A_LINE.test(dims[0].member)) {
      raws.push({ key, end: f.c.end, kind, axis: dims[0].axis, member: dims[0].member, concept: f.concept, value: f.value });
      continue;
    }
    const geo = f.c.dims.filter((d) => !neutralForGeography(d));
    if (geo.length === 1 && (GEO_AXES as readonly string[]).includes(geo[0].axis) && !NOT_A_PLACE.test(geo[0].member)) raws.push({ key, end: f.c.end, kind, axis: geo[0].axis, member: geo[0].member, concept: f.concept, value: f.value });
  }
  const kinds = lineKinds(raws);
  const mixed = [...kinds].filter(([, k]) => k === "mixed").map(([axis]) => [...new Set(raws.filter((r) => r.axis === axis).map((r) => memberName(r.member)))]);
  const isGeoAxis = (axis: string) => (GEO_AXES as readonly string[]).includes(axis);
  // Geographic axes first, so a place on both a geographic and a segment axis is read once, from the geographic one.
  raws.sort((a, b) => Number(!isGeoAxis(a.axis)) - Number(!isGeoAxis(b.axis)));
  const byFamily: Record<SegmentFamily, Map<string, RawPeriod & { concepts: Map<string, string> }>> = { segment: new Map(), product: new Map(), geography: new Map() };
  for (const r of raws) {
    const k = kinds.get(r.axis)!;
    if (k === "mixed") continue;
    const famName: SegmentFamily = k === "place" ? "geography" : k;
    const fam = byFamily[famName];
    const p = fam.get(r.key) ?? { end: r.end, kind: r.kind, total: null, lines: new Map(), concepts: new Map() };
    const name = (famName === "geography" ? placeOf(r.member).name : memberName(r.member)).slice(0, 80);
    if (!name) continue;
    // One concept per line: the most preferred the filing uses for it.
    const had = p.concepts.get(name);
    if (!had || rank(r.concept) < rank(had)) {
      p.lines.set(name, r.value);
      p.concepts.set(name, r.concept);
    }
    fam.set(r.key, p);
  }
  const out: Record<SegmentFamily, RawPeriod[]> = { segment: [], product: [], geography: [] };
  for (const fam of SEGMENT_FAMILIES) {
    for (const [key, p] of byFamily[fam]) {
      // A single line is no split; a period whose lines run past its total is a mix of axes, not one split.
      if (p.lines.size < 2) continue;
      const total = totals.get(key)?.value ?? null;
      if (fam === "geography") {
        // Places overlap (a country inside its region): the set that adds up to revenue, and none when no set does.
        const r = reconcileGeography([...p.lines].map(([name, value]) => ({ name, grain: placeOf(name).grain, value })), total);
        if (!r || r.partial || r.lines.length < 2) continue;
        const keep = new Set(r.lines.map((l) => l.name));
        out.geography.push({ end: p.end, kind: p.kind, total, lines: new Map([...p.lines].filter(([n]) => keep.has(n))) });
        continue;
      }
      const sum = [...p.lines.values()].reduce((a, b) => a + b, 0);
      if (total !== null && sum > total * (1 + GEO_TOLERANCE)) continue;
      out[fam].push({ end: p.end, kind: p.kind, total, lines: p.lines });
    }
  }
  return { family: out, currency, mixed };
}

/** Why an axis that mixes places with businesses is drawn in no family, in a sentence. */
export function mixedNote(mixed: readonly (readonly string[])[]): string | null {
  const first = mixed.find((m) => m.length >= 2);
  return first ? `The reported segments mix places with businesses (${first.slice(0, 4).join(", ")}), so they are drawn as no split of their own.` : null;
}

/**
 * A history kept before places had a family of their own, separated by the
 * lines' names: a family whose lines are all places becomes the geography
 * (when none was read), one that mixes places with businesses is dropped
 * with a note. A history read under SEGMENT_HISTORY_VERSION passes as it is.
 */
export function separateHistory(h: SegmentHistory): SegmentHistory {
  if (h.version >= SEPARATED_SINCE) return h;
  const out: SegmentHistory = { ...h, segment: h.segment, product: h.product, geography: h.geography ?? null };
  const notes: string[] = [];
  for (const fam of ["segment", "product"] as const) {
    const series = out[fam];
    const latest = series ? (series.quarters.at(-1) ?? series.years.at(-1)) : undefined;
    if (!series || !latest) continue;
    const places = latest.lines.filter((l) => isPlaceName(l.name)).length;
    if (!places) continue;
    if (places === latest.lines.length && !out.geography) out.geography = series;
    else if (places < latest.lines.length) notes.push(mixedNote([latest.lines.map((l) => l.name)]) ?? "");
    out[fam] = null;
  }
  const note = [h.note, ...notes].filter(Boolean).join(" ").slice(0, 300) || null;
  return { ...out, note };
}

/** The families a history can draw over time, once separated: two quarters or two years at least. */
export function segmentFamilies(kept: SegmentHistory): SegmentFamily[] {
  const h = separateHistory(kept);
  return SEGMENT_FAMILIES.filter((f) => h[f] && (h[f]!.quarters.length >= 2 || h[f]!.years.length >= 2));
}

/**
 * The reads of several filings laid into one history, newest filing first so
 * a restated period takes its latest figures; a fourth quarter is the year
 * less its first three quarters, line by line, when all three are there and
 * the result is above zero (`derived`). The largest lines of the latest
 * period are kept, the same lines in every period.
 */
export function mergeSegmentSeries(reads: readonly SegmentSeriesRead[]): Record<SegmentFamily, FamilySeries | null> {
  const result = { segment: null, product: null, geography: null } as Record<SegmentFamily, FamilySeries | null>;
  for (const fam of SEGMENT_FAMILIES) {
    const periods = new Map<string, RawPeriod>();
    for (const r of reads) for (const p of r.family[fam]) if (!periods.has(`${p.kind}|${p.end}`)) periods.set(`${p.kind}|${p.end}`, p);
    const quarters = [...periods.values()].filter((p) => p.kind === "quarter");
    const years = [...periods.values()].filter((p) => p.kind === "year");
    // The fourth quarter: a year whose three earlier quarters are kept and whose own last quarter is not.
    for (const y of years) {
      if (quarters.some((q) => Math.abs(days(q.end, y.end)) <= 10)) continue;
      const inside = quarters.filter((q) => days(q.end, y.end) > 30 && days(q.end, y.end) < 300);
      if (inside.length !== 3) continue;
      const lines = new Map<string, number>();
      for (const [name, v] of y.lines) {
        const parts = inside.map((q) => q.lines.get(name));
        if (parts.some((x) => x === undefined)) continue;
        const q4 = v - parts.reduce<number>((a, b) => a + (b ?? 0), 0);
        if (q4 > 0) lines.set(name, q4);
      }
      if (lines.size < 2) continue;
      const total = y.total !== null && inside.every((q) => q.total !== null) ? y.total - inside.reduce((a, q) => a + (q.total ?? 0), 0) : null;
      quarters.push({ end: y.end, kind: "quarter", total: total !== null && total > 0 ? total : null, lines, derived: true } as RawPeriod & { derived: boolean });
    }
    const order = (a: RawPeriod, b: RawPeriod) => a.end.localeCompare(b.end);
    const q = quarters.sort(order).slice(-SEGMENT_QUARTERS);
    const yr = years.sort(order).slice(-SEGMENT_YEARS);
    const latest = (q.at(-1) ?? yr.at(-1))?.lines;
    if (!latest) continue;
    const keep = [...latest.entries()].sort((a, b) => b[1] - a[1]).slice(0, SEGMENT_MAX_LINES).map(([n]) => n);
    const shape = (p: RawPeriod): SegmentPeriod => ({ end: p.end, total: p.total, lines: keep.filter((n) => p.lines.has(n)).map((n) => ({ name: n, value: p.lines.get(n)! })), derived: !!(p as RawPeriod & { derived?: boolean }).derived });
    const qs = q.map(shape).filter((p) => p.lines.length >= 2);
    const ys = yr.map(shape).filter((p) => p.lines.length >= 2);
    result[fam] = qs.length || ys.length ? { quarters: qs, years: ys } : null;
  }
  return result;
}

/** Which filings make the history: the latest annual report and the three latest 10-Qs, newest first. */
export function segmentHistoryFilings(all: readonly LatestFiling[]): LatestFiling[] {
  const annual = all.find((f) => (ANNUAL_FORMS as readonly string[]).includes(f.form));
  const tenQs = all.filter((f) => f.form === "10-Q").slice(0, 3);
  return [...tenQs, ...(annual ? [annual] : [])].sort((a, b) => (b.filingDate ?? "").localeCompare(a.filingDate ?? ""));
}

// ---------------------------------------------------------------------------
// The engine

/** A line counts as an engine when it is at least this share of revenue (D.1(a) test (ii), C3) ... */
export const ENGINE_SHARE_PCT = 15;
/** ... and grows faster than this (D.1(a) test (i)). */
export const ENGINE_GROWTH_PCT = 20;

export type Engine = { values: Pick<Fundamentals["values"], "engine_growth_pct" | "engine_share_pct">; notes: string[]; /** The engine line, when a line rather than the company is the engine. */ line: SegmentLine | null };

/**
 * The engine's growth and share: company revenue growth (trailing, from the
 * facts) or, when a reported line at least 15% of revenue grows faster, that
 * line's growth over the filing's period. A line excluded under C3(a) is not
 * an engine; C3(b) (price-driven growth) is in the filing's text and stays
 * the reader's to check, so the note says so. Nothing is a zero: with no
 * growth figure at all the engine has no reading.
 */
export function engineOf(read: SegmentRead | null, revenueGrowthPct: number | null | undefined, readProblem: string | null = null): Engine {
  const notes: string[] = [];
  const company = revenueGrowthPct ?? null;
  const candidates = (read?.lines ?? []).filter((l) => l.sharePct !== null && l.sharePct >= ENGINE_SHARE_PCT && l.growthPct !== null && l.growthPct > ENGINE_GROWTH_PCT && !l.excluded);
  const best = candidates.sort((a, b) => b.growthPct! - a.growthPct!)[0] ?? null;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  if (readProblem) notes.push(`engine: ${readProblem}; company revenue growth stands in`);
  else if (!read) notes.push("engine: the latest filing's instance has no segment or revenue line; company revenue growth stands in");
  else if (read.totalRevenue === null) notes.push(`engine: the ${read.period} has segment lines but no company total to take their share of; company revenue growth stands in`);
  if (read?.fallback) notes.push(`engine: ${read.fallback}`);
  if (best && (company === null || best.growthPct! > company)) {
    notes.push(`engine: ${best.name}, ${best.sharePct!.toFixed(1)}% of revenue, ${pct(best.growthPct!)} over the ${read!.period} against a year before; whether price rather than volume drove it (C3(b)) is in the filing's text, yours to check`);
    return { values: { engine_growth_pct: best.growthPct, engine_share_pct: best.sharePct }, notes, line: best };
  }
  if (read && read.totalRevenue !== null && !best) {
    const excluded = read.lines.filter((l) => l.excluded && l.sharePct !== null && l.sharePct >= ENGINE_SHARE_PCT && l.growthPct !== null && l.growthPct > ENGINE_GROWTH_PCT);
    notes.push(`engine: no line at least ${ENGINE_SHARE_PCT}% of revenue grows above ${ENGINE_GROWTH_PCT}% over the ${read.period}${excluded.length ? ` (${excluded.map((l) => l.name).join(", ")} excluded as installed-base service, C3(a))` : ""}; company revenue growth stands`);
  }
  if (company === null) {
    notes.push("engine: no revenue growth could be read, so the engine has no reading");
    return { values: { engine_growth_pct: null, engine_share_pct: null }, notes, line: null };
  }
  return { values: { engine_growth_pct: company, engine_share_pct: 100 }, notes, line: null };
}

/** The fundamentals with the engine laid on: its two fields and its notes. */
export function withEngine(f: Fundamentals, e: Engine): Fundamentals {
  return { values: { ...f.values, ...e.values }, notes: [...f.notes, ...e.notes] };
}

/** The lines as text for the writer and the facts block: period, currency units as filed, each line's figure, growth and share. */
export function segmentText(read: SegmentRead | null, currency: string | null): string {
  if (!read) return "Segment and revenue lines: none in the latest filing's instance.";
  const unit = (v: number) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6).toLocaleString("en-US")}m` : v.toLocaleString("en-US"));
  const head = `Segment and revenue lines from the ${read.form}${read.fallback ? " (an earlier filing: the latest could not be read)" : ""}, ${read.period} against a year before${currency ? `, in ${currency}` : ""}${read.totalRevenue !== null ? `; company revenue ${unit(read.totalRevenue)}` : "; no company total in the instance"}. Segments, revenue lines and places are separate splits of the same revenue: never add one to another, and never call a place a segment of what the company sells:`;
  const marks: Record<LineKind, string> = { segment: "", product: " (revenue line)", place: " (place)", mixed: " (a segment in a split that mixes places and businesses)" };
  const rows = read.lines.slice(0, 30).map((l) => `- ${l.name}${marks[l.kind ?? familyOf(l.axis)]}: ${unit(l.value)}${l.prior !== null ? ` (prior ${unit(l.prior)}, ${l.growthPct !== null ? `${l.growthPct >= 0 ? "+" : ""}${l.growthPct.toFixed(1)}%` : "n/a"})` : " (no prior-year figure)"}${l.sharePct !== null ? `, ${l.sharePct.toFixed(1)}% of revenue` : ""}${l.excluded ? `; ${l.excluded}` : ""}`);
  return [head, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Revenue by geography

/** The annual forms: the geography is read from the latest of these, else from the latest 10-Q. */
export const ANNUAL_FORMS = ["10-K", "20-F", "40-F"] as const;

/** The filing revenue by geography is read from: the latest 10-K, 20-F or 40-F among the newest periodic filings (two years of them), else the latest 10-Q; null when there is none. */
export function geographyFilingOf(json: unknown): LatestFiling | null {
  const filings = periodicFilingsOf(json, 8);
  return filings.find((f) => (ANNUAL_FORMS as readonly string[]).includes(f.form)) ?? filings[0] ?? null;
}

/** Axes whose members are places. */
const GEO_AXES = ["srt:StatementGeographicalAxis", "us-gaap:StatementGeographicalAxis", "ifrs-full:GeographicalAreasAxis"] as const;
/** Segment axes, read as geography only when every member on them is a place (a company that reports by country, such as MercadoLibre). */
const GEO_IF_PLACES = ["us-gaap:StatementBusinessSegmentsAxis", "srt:SegmentsAxis", "ifrs-full:SegmentsAxis"] as const;
/** Dimensions that qualify a geographic revenue fact without changing what it is. */
function neutralForGeography(d: { axis: string; member: string }): boolean {
  if (/ConsolidationItemsAxis$/.test(d.axis)) return /OperatingSegmentsMember$/.test(d.member);
  if (/ConcentrationRiskByTypeAxis$/.test(d.axis)) return true;
  if (/ConcentrationRiskByBenchmarkAxis$/.test(d.axis)) return /Revenue|Sales/i.test(d.member);
  return false;
}
/** Members that are not a place: totals, eliminations, reconciling items, hedging. */
const NOT_A_PLACE = /Elimination|Intersegment|Corporate|Reconcil|Consolidat|Total|Unallocated|Hedg/i;

/** Standard members in words. */
const PLACE_MEMBERS: Record<string, string> = {
  "srt:AmericasMember": "Americas",
  "srt:NorthAmericaMember": "North America",
  "srt:SouthAmericaMember": "South America",
  "srt:LatinAmericaMember": "Latin America",
  "srt:CentralAmericaMember": "Central America",
  "srt:EuropeMember": "Europe",
  "srt:AsiaMember": "Asia",
  "srt:AsiaPacificMember": "Asia Pacific",
  "srt:AfricaMember": "Africa",
  "srt:MiddleEastMember": "Middle East",
  "srt:EuropeMiddleEastAndAfricaMember": "Europe, Middle East and Africa",
  "us-gaap:EMEAMember": "Europe, Middle East and Africa",
  "us-gaap:NonUsMember": "Outside the US",
  "ifrs-full:CountryOfDomicileMember": "Country of domicile",
  "ifrs-full:ForeignCountriesMember": "Outside the country of domicile",
};

/** The usual short forms, by their lower-case words. */
const PLACE_ALIASES: Record<string, string> = {
  us: "United States",
  "u s": "United States",
  usa: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  emea: "Europe, Middle East and Africa",
  "europe middle east and africa": "Europe, Middle East and Africa",
  "europe middle east africa": "Europe, Middle East and Africa",
  apac: "Asia Pacific",
  "asia pacific": "Asia Pacific",
  latam: "Latin America",
  eucan: "Europe and Canada",
  "us and canada": "United States and Canada",
  "us can": "United States and Canada",
  "united states and canada": "United States and Canada",
  "non us": "Outside the US",
  "outside us": "Outside the US",
  "rest of world": "Rest of world",
  "rest of the world": "Rest of world",
  row: "Rest of world",
  "hong kong sar china": "Hong Kong",
};
/** Words lower-cased after the first, so "Rest Of World" reads "Rest of world". */
const SMALL_WORDS = new Set(["of", "and", "the", "in", "other", "all", "world", "countries", "country", "markets", "market", "regions", "region", "operations", "areas", "area"]);

let countryNames: Set<string> | null = null;
/** Whether a name is a country's, from every region name Intl knows (read once). */
function isCountryName(name: string): boolean {
  if (!countryNames) {
    countryNames = new Set(["United States", "United Kingdom", "Hong Kong", "Taiwan"]);
    try {
      const d = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          let n: string | undefined;
          try {
            n = d.of(code);
          } catch {
            n = undefined;
          }
          if (n && n !== code && !/Union|Eurozone|Nations|Outlying|world|Unknown|Pseudo/i.test(n)) countryNames.add(n);
        }
    } catch {
      // Without Intl's region names only the members' own country codes say country.
    }
  }
  return countryNames.has(name);
}

/** "country:KR" in words: "South Korea"; the code itself when Intl does not know it. */
function countryOfCode(code: string): string {
  if (code === "HK") return "Hong Kong";
  try {
    const n = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return n && n !== code ? n : code;
  } catch {
    return code;
  }
}

export type Grain = "country" | "region";

/** A geographic member in words, and whether it names a country or a region: "country:US" is "United States", "asml:ChinaMember" is "China", "amzn:RestOfWorldMember" is "Rest of world". */
export function placeOf(member: string): { name: string; grain: Grain } {
  const iso = /^country:([A-Z]{2})$/.exec(member);
  if (iso) return { name: countryOfCode(iso[1]), grain: "country" };
  const known = PLACE_MEMBERS[member];
  const words = known ?? memberName(member).replace(/\s*\b(Geographic(al)?|Region|Area)$/i, "").trim();
  const alias = PLACE_ALIASES[words.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()];
  const name = alias ?? known ?? words.split(" ").map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(" ");
  return { name, grain: isCountryName(name) ? "country" : "region" };
}

const PLACE_WORDS = /\b(America|Americas|American|Europe|European|EMEA|EUCAN|Asia|Asian|Pacific|APAC|Africa|Middle East|Oceania|Nordic|Nordics|Scandinavia|International|Domestic|Foreign|World|Countries|Emerging Markets|Latin|LatAm|Greater China|Rest of|Outside the)\b/i;
/** Whether a member names a place: a country code, a standard region, a country's name or a region's words. */
function isPlace(member: string): boolean {
  if (/^country:[A-Z]{2}$/.test(member) || member in PLACE_MEMBERS) return true;
  const p = placeOf(member);
  return p.grain === "country" || PLACE_WORDS.test(p.name);
}

/** A line that holds what the others do not name: it says least about where revenue is. */
const RESIDUAL = /^(rest of (the )?world|all other|other (countries|regions|markets)|outside the|international|foreign)/i;

export type PlaceValue = { name: string; grain: Grain; value: number };
export type Reconciled = { lines: { name: string; grain: Grain; sharePct: number }[]; placedPct: number; partial: boolean; note: string | null };

/** Within this share of company revenue, the lines add up to it. */
export const GEO_TOLERANCE = 0.03;
/** The most lines searched for a set that adds up: 2^20 sums. */
const MAX_SEARCH = 20;

/**
 * The lines a filing gives, made to add up to company revenue without
 * inventing any. A member equal to the total is dropped. Where the lines
 * overlap (a country inside a region, two splits of the same revenue on one
 * axis), the set that adds up to revenue is kept, preferring the one that
 * names the most revenue (least in "rest of world" and the like), then the
 * most at country grain, then the most lines. When no set adds up, the
 * largest set within revenue is kept and the company is partial: what the
 * lines do not place is not placed. Without a company total, a line that is
 * the sum of two or more others is dropped and the shares are of the lines.
 * Null when nothing is left. Pure.
 */
export function reconcileGeography(given: PlaceValue[], total: number | null): Reconciled | null {
  const byName = new Map<string, PlaceValue>();
  for (const l of given) if (l.value > 0 && !byName.has(l.name)) byName.set(l.name, l);
  let lines = [...byName.values()].sort((a, b) => b.value - a.value);
  const notes: string[] = [];
  if (lines.length > MAX_SEARCH) {
    notes.push(`the ${lines.length - MAX_SEARCH} smallest lines left out`);
    lines = lines.slice(0, MAX_SEARCH);
  }
  const sumOf = (ls: PlaceValue[]) => ls.reduce((s, l) => s + l.value, 0);
  /** Every subset's sum, by bit mask. */
  const sums = (ls: PlaceValue[]) => {
    const out = new Float64Array(1 << ls.length);
    for (let m = 1; m < out.length; m++) {
      const low = m & -m;
      out[m] = out[m ^ low] + ls[31 - Math.clz32(low)].value;
    }
    return out;
  };
  const pick = (ls: PlaceValue[], m: number) => ls.filter((_, i) => m & (1 << i));
  let partial = false;
  let base: number;
  if (total !== null && total > 0) {
    const asTotal = lines.filter((l) => Math.abs(l.value - total) <= total * 0.005);
    if (asTotal.length && lines.length > asTotal.length) lines = lines.filter((l) => !asTotal.includes(l));
    const sum = sumOf(lines);
    if (sum > total * (1 + GEO_TOLERANCE)) {
      const all = sums(lines);
      // A set that holds a place and a line naming it ("United States" and "United States and Canada") counts the place twice.
      const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;
      const inside = lines.map((a) => lines.map((b) => a !== b && !/^(rest of|other|all other)\b/i.test(b.name) && words(b.name).includes(words(a.name))));
      const score = (m: number) => {
        const idx = lines.map((_, i) => i).filter((i) => m & (1 << i));
        const ls = idx.map((i) => lines[i]);
        const clash = idx.some((i) => idx.some((j) => inside[i][j])) ? 0 : 1;
        return [clash, ls.filter((l) => !RESIDUAL.test(l.name)).reduce((s, l) => s + l.value, 0), ls.filter((l) => l.grain === "country").reduce((s, l) => s + l.value, 0), ls.length];
      };
      const eps = total * 1e-9;
      const better = (s: number[], b: number[]) => {
        for (let k = 0; k < s.length; k++) if (Math.abs(s[k] - b[k]) > eps) return s[k] > b[k];
        return false;
      };
      let best = -1;
      let bestScore: number[] = [];
      // Exact first: a set that adds up to the cent beats one that adds up by chance within a percent.
      for (const tol of [0.001, 0.01, GEO_TOLERANCE]) {
        for (let m = 1; m < all.length; m++) {
          if (Math.abs(all[m] - total) > total * tol) continue;
          const s = score(m);
          if (best < 0 || better(s, bestScore)) {
            best = m;
            bestScore = s;
          }
        }
        if (best >= 0) break;
      }
      if (best < 0) {
        // No set adds up: the largest set within revenue; the rest is not placed.
        partial = true;
        for (let m = 1; m < all.length; m++) if (all[m] <= total * (1 + GEO_TOLERANCE) && (best < 0 || all[m] > all[best])) best = m;
      }
      const kept = best < 0 ? [] : pick(lines, best);
      const left = lines.filter((l) => !kept.includes(l));
      if (left.length) notes.push(`${left.map((l) => l.name).join(", ")} left out: ${left.length === 1 ? "it overlaps" : "they overlap"} the other lines`);
      lines = kept;
    } else if (sum < total * (1 - GEO_TOLERANCE)) partial = true;
    base = Math.max(total, sumOf(lines));
  } else {
    // No total to test against: drop a line that is the sum of two or more others, and take shares of what is left.
    const all = sums(lines);
    const aggregate = lines.filter((l, i) => {
      for (let m = 1; m < all.length; m++) if (!(m & (1 << i)) && (m & (m - 1)) !== 0 && Math.abs(all[m] - l.value) <= l.value * 0.002) return true;
      return false;
    });
    if (aggregate.length) notes.push(`${aggregate.map((l) => l.name).join(", ")} left out as the sum of other lines`);
    lines = lines.filter((l) => !aggregate.includes(l));
    notes.push("no company total in the filing to test the lines against; shares are of the lines");
    base = sumOf(lines);
  }
  if (!lines.length || base <= 0) return null;
  const out = lines.map((l) => ({ name: l.name, grain: l.grain, sharePct: (l.value / base) * 100 })).sort((a, b) => b.sharePct - a.sharePct);
  const placedPct = out.reduce((s, l) => s + l.sharePct, 0);
  if (partial) notes.push(`the lines place ${placedPct.toFixed(1)}% of revenue; the filing does not place the rest`);
  return { lines: out, placedPct, partial, note: notes.length ? notes.join("; ") : null };
}

export type GeographyRead = Reconciled & { form: string; period: string; periodEnd: string; totalRevenue: number | null; given: PlaceValue[] };

/**
 * Revenue by geography from an XBRL instance: each revenue fact with exactly
 * one explicit member on a geographic axis (or on a segment axis whose
 * members are all places), for the latest period at its longest length (the
 * year in a 10-K, the year to date in a 10-Q), in the concept that names the
 * most places, reconciled to the undimensioned company total
 * (reconcileGeography). Null when the instance gives no revenue by place;
 * throws when the text is not an XBRL instance.
 */
export function geographyRead(xml: string, form: string): GeographyRead | null {
  if (!/<(?:xbrli:)?context\b/.test(xml)) throw new Error("not an XBRL instance: no contexts");
  const ctx = contexts(xml);
  const facts = revenueFacts(xml).map((f) => ({ ...f, c: ctx.get(f.contextRef) })).filter((f): f is Fact & { c: Context } => !!f.c && f.c.start !== null);
  type Placed = Fact & { c: Context; axis: string; member: string };
  const placed: Placed[] = [];
  const totals: (Fact & { c: Context })[] = [];
  for (const f of facts) {
    if (f.c.dims.length === 0) {
      totals.push(f);
      continue;
    }
    const dims = f.c.dims.filter((d) => !neutralForGeography(d));
    if (dims.length !== 1 || NOT_A_PLACE.test(dims[0].member)) continue;
    const { axis, member } = dims[0];
    if ((GEO_AXES as readonly string[]).includes(axis) || (GEO_IF_PLACES as readonly string[]).includes(axis)) placed.push({ ...f, axis, member });
  }
  if (!placed.length) return null;
  const isSegmentAxis = (axis: string) => (GEO_IF_PLACES as readonly string[]).includes(axis);
  // A segment axis counts only when every member on it is a place.
  const notPlaces = new Set(placed.filter((l) => isSegmentAxis(l.axis) && !isPlace(l.member)).map((l) => l.axis));
  const usable = placed.filter((l) => !notPlaces.has(l.axis));
  if (!usable.length) return null;
  const periodEnd = usable.map((l) => l.c.end).sort().at(-1)!;
  const periodDays = Math.max(...usable.filter((l) => l.c.end === periodEnd).map((l) => days(l.c.start!, l.c.end)));
  const same = (l: { c: Context }) => Math.abs(days(l.c.start!, l.c.end) - periodDays) <= 10 && Math.abs(days(periodEnd, l.c.end)) <= 20;
  const now = usable.filter(same);
  // The concept that names the most places; a tie goes to the preferred revenue concept.
  const count = (concept: string) => new Set(now.filter((l) => l.concept === concept).map((l) => l.member)).size;
  const concept = REVENUE_CONCEPTS.filter((c) => count(c) > 0).sort((a, b) => count(b) - count(a))[0];
  const total = totals.find((t) => t.concept === concept && same(t))?.value ?? REVENUE_CONCEPTS.map((c) => totals.find((t) => t.concept === c && same(t))?.value).find((v) => v !== undefined) ?? null;
  // Geographic axes before segment axes, so a member on both is read once.
  const ordered = now.filter((l) => l.concept === concept).sort((a, b) => Number(isSegmentAxis(a.axis)) - Number(isSegmentAxis(b.axis)));
  const seen = new Set<string>();
  const given: PlaceValue[] = [];
  for (const l of ordered) {
    if (seen.has(l.member)) continue;
    seen.add(l.member);
    given.push({ ...placeOf(l.member), value: l.value });
  }
  const r = reconcileGeography(given, total);
  if (!r) return null;
  return { ...r, form, period: periodWords(periodDays, periodEnd), periodEnd, totalRevenue: total, given };
}

/** The read as the filings file keeps it, with the filing's accession. */
export function revenueGeographyOf(read: GeographyRead, accession: string | null): RevenueGeography {
  return { form: read.form, period: read.period, periodEnd: read.periodEnd, accession, lines: read.lines.slice(0, 30).map((l) => ({ name: l.name.slice(0, 80), grain: l.grain, sharePct: Math.round(l.sharePct * 1000) / 1000 })), placedPct: Math.round(read.placedPct * 1000) / 1000, partial: read.partial, note: read.note ? read.note.slice(0, 300) : null };
}
