import { forwardPeOf } from "@/lib/forward";
import type { ScreenCompany } from "@/lib/screener";

/**
 * A company's multiples beside its peers' and its sector's (Hamza, 23 Oct
 * 2026: "compare valuations to other similar companies and the specific
 * sector the company is in at a whole"). The peers are the companies of the
 * screener's file (the S&P 500 and the Nasdaq-100, read from their filings)
 * in the same GICS sub-industry; a company the S&P 500's list does not carry
 * is placed by its SEC industry code, at four digits, else three, else two,
 * until MIN_PEERS are found, and the basis is said. The sector is taken
 * whole: its multiple is the sector's market value over the figure under it
 * (the cap-weighted harmonic mean, as an index's P/E is), beside its median.
 * Every figure is the filings' own; the analysts' consensus is the company's
 * alone, since it is read only for the companies held, watched or opened.
 * Pure: nothing fetched, kept or logged.
 */

export const PEER_METRICS = [
  { field: "pe_ratio", label: "P/E" },
  { field: "forward_pe", label: "Fwd P/E" },
  { field: "ps_ratio", label: "P/S" },
  { field: "forward_ps", label: "Fwd P/S" },
  { field: "pfcf_ratio", label: "P/FCF" },
  { field: "forward_pfcf", label: "Fwd P/FCF" },
] as const;
export type PeerField = (typeof PEER_METRICS)[number]["field"];

/** Fewer peers than this and the code is widened a digit. */
export const MIN_PEERS = 3;
/** Peers listed by name, the largest first. */
export const PEERS_SHOWN = 8;

export type PeerSubject = {
  symbol: string;
  sector: string | null;
  subIndustry: string | null;
  sic: number | null;
  values: Readonly<Record<string, number | null | undefined>>;
};

export type PeerBasis = { kind: "gics"; label: string } | { kind: "sic"; code: number; digits: 4 | 3 | 2 } | { kind: "none" };

export type PeerRow = {
  field: PeerField;
  label: string;
  company: number | null;
  peersMedian: number | null;
  peersN: number;
  /** The company against its peers' median, in percent: above zero a premium. */
  vsPeersPct: number | null;
  sectorWhole: number | null;
  sectorMedian: number | null;
  sectorN: number;
  vsSectorPct: number | null;
};

export type PeerComparison = {
  basis: PeerBasis;
  /** The basis in a sentence. */
  words: string;
  sector: string | null;
  peers: { symbol: string; name: string | null; cap: number | null; values: Record<string, number> }[];
  peerCount: number;
  sectorCount: number;
  rows: PeerRow[];
  /** What the comparison could not read, in sentences. */
  notes: string[];
};

const usable = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A company's multiple; a forward P/E kept before the field was derived is the P/E over its growth, as fundamentalsOf derives it. */
function valueOf(values: Readonly<Record<string, number | null | undefined>>, field: PeerField): number | null {
  if (field === "forward_pe") return forwardPeOf(values);
  const v = values[field];
  return usable(v) ? v : null;
}

function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
}

/** The sector as a whole: market value over the figure under it, from the companies with both. */
function whole(companies: readonly ScreenCompany[], field: PeerField): number | null {
  let cap = 0;
  let under = 0;
  for (const c of companies) {
    const v = valueOf(c.values, field);
    if (!usable(v) || !usable(c.cap)) continue;
    cap += c.cap;
    under += c.cap / v;
  }
  return under > 0 ? cap / under : null;
}

const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const vs = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : round((a / b - 1) * 100, 1));

/** The peers and the basis they were found on. */
export function peersOf(subject: PeerSubject, companies: readonly ScreenCompany[]): { basis: PeerBasis; peers: ScreenCompany[] } {
  const others = companies.filter((c) => !c.error && c.symbol.toUpperCase() !== subject.symbol.toUpperCase());
  if (subject.subIndustry) {
    const peers = others.filter((c) => c.subIndustry === subject.subIndustry);
    if (peers.length) return { basis: { kind: "gics", label: subject.subIndustry }, peers };
  }
  if (subject.sic !== null && Number.isInteger(subject.sic)) {
    for (const digits of [4, 3, 2] as const) {
      const div = 10 ** (4 - digits);
      const code = Math.floor(subject.sic / div);
      const peers = others.filter((c) => c.sic !== null && Math.floor(c.sic / div) === code);
      if (peers.length >= MIN_PEERS || (digits === 2 && peers.length)) return { basis: { kind: "sic", code, digits }, peers };
    }
  }
  return { basis: { kind: "none" }, peers: [] };
}

export function peerComparison(subject: PeerSubject, companies: readonly ScreenCompany[]): PeerComparison {
  const notes: string[] = [];
  const { basis, peers } = peersOf(subject, companies);
  const inSector = subject.sector ? companies.filter((c) => !c.error && c.sector === subject.sector) : [];
  const words =
    basis.kind === "gics"
      ? `Peers: the ${peers.length} other ${peers.length === 1 ? "company" : "companies"} of the S&P 500 and the Nasdaq-100 in GICS ${basis.label}.`
      : basis.kind === "sic"
        ? `Peers: the ${peers.length} ${peers.length === 1 ? "company" : "companies"} of the S&P 500 and the Nasdaq-100 with SEC industry code ${basis.code}${basis.digits < 4 ? ` (the first ${basis.digits} digits)` : ""}, since the S&P 500's list gives this company no GICS sub-industry.`
        : subject.sic === null && !subject.subIndustry
          ? "No peers: the company has no GICS sub-industry and its SEC industry code is not read yet."
          : "No peers on file: the screener has not read a company in the same sub-industry or industry code yet.";
  if (!subject.sector) notes.push("No sector: the filings read has not placed the company in one yet.");
  if (basis.kind === "sic" && peers.every((p) => !Object.keys(p.values).length)) notes.push("The peers' figures are not read yet; the screener reads a share of the list each day.");
  const rows: PeerRow[] = PEER_METRICS.map(({ field, label }) => {
    const company = round(valueOf(subject.values, field));
    const pv = peers.map((p) => valueOf(p.values, field)).filter(usable);
    const sv = inSector.map((p) => valueOf(p.values, field)).filter(usable);
    const peersMedian = round(median(pv));
    const sectorWhole = round(whole(inSector, field));
    return { field, label, company, peersMedian, peersN: pv.length, vsPeersPct: vs(company, peersMedian), sectorWhole, sectorMedian: round(median(sv)), sectorN: sv.length, vsSectorPct: vs(company, sectorWhole) };
  });
  const shown = [...peers]
    .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0))
    .slice(0, PEERS_SHOWN)
    .map((p) => ({ symbol: p.symbol, name: p.name, cap: p.cap, values: Object.fromEntries(PEER_METRICS.flatMap(({ field }) => {
      const v = valueOf(p.values, field);
      return v === null ? [] : [[field, round(v)!]];
    })) }));
  return { basis, words, sector: subject.sector, peers: shown, peerCount: peers.length, sectorCount: inSector.length, rows, notes };
}

/** One row in words: the company's multiple against its peers and its sector. */
export function peerRowWords(r: PeerRow): string {
  if (r.company === null) return `${r.label}: not read for the company.`;
  const peers = r.peersMedian === null ? "no peer read" : `peers' median ${r.peersMedian.toFixed(1)}x (${r.peersN})`;
  const sector = r.sectorWhole === null ? "the sector not read" : `the sector as a whole ${r.sectorWhole.toFixed(1)}x`;
  return `${r.label} ${r.company.toFixed(1)}x against ${peers} and ${sector}.`;
}
