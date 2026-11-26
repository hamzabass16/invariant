/**
 * A fund's holdings from its N-PORT report to the SEC: every position's
 * issuer, identifiers and share of net assets, as the fund filed it. SPY and
 * QQQ file one each quarter; the latest public one is the basis of their
 * look-through (lib/look-through.ts). Pure; lib/edgar.ts fetches.
 */

export type NportPosition = {
  /** The issuer as filed ("NVIDIA Corp"). */
  name: string;
  title: string | null;
  cusip: string | null;
  isin: string | null;
  /** Percent of the fund's net assets. */
  pct: number;
  /** EC common equity, EP preferred, DBT debt, STIV short-term vehicle... */
  assetCat: string | null;
};

export type NportReport = {
  /** The date the holdings are as of. */
  reportDate: string;
  netAssets: number | null;
  positions: NportPosition[];
};

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .trim();

/** The text of the first element with this local name (any namespace prefix), or null. */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(xml);
  return m ? decode(m[1]) : null;
}

/** An attribute of the first element with this local name. */
function attr(xml: string, name: string, attribute: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\s[^>]*\\b${attribute}="([^"]*)"`).exec(xml);
  return m ? decode(m[1]) : null;
}

/**
 * The report from an N-PORT primary document. Throws when it is not one: a
 * document that cannot be read never looks like a fund with no holdings.
 */
export function parseNport(xml: string): NportReport {
  const reportDate = tag(xml, "repPdDate");
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("no report date: not an N-PORT document");
  const net = Number(tag(xml, "netAssets"));
  const positions: NportPosition[] = [];
  const re = /<(?:[\w-]+:)?invstOrSec(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?invstOrSec>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[1];
    const name = tag(body, "name");
    const pct = Number(tag(body, "pctVal"));
    if (!name || !Number.isFinite(pct)) continue;
    const cusip = tag(body, "cusip");
    positions.push({
      name,
      title: tag(body, "title"),
      cusip: cusip && cusip !== "N/A" && cusip !== "000000000" ? cusip : null,
      isin: attr(body, "isin", "value"),
      pct,
      assetCat: tag(body, "assetCat"),
    });
  }
  if (!positions.length) throw new Error("no positions: the holdings section could not be read");
  return { reportDate, netAssets: Number.isFinite(net) && net > 0 ? net : null, positions };
}

export type FundIssuer = { name: string; pct: number; classes: number };

/**
 * The fund's common-equity issuers by share of net assets, largest first:
 * two share classes of one company (Alphabet A and C) are one issuer, matched
 * on the first six characters of the CUSIP (the issuer's code), else the name.
 */
export function issuersOf(report: NportReport): FundIssuer[] {
  const by = new Map<string, FundIssuer>();
  for (const p of report.positions) {
    if (p.assetCat && p.assetCat !== "EC") continue;
    if (p.pct <= 0) continue;
    const key = p.cusip ? p.cusip.slice(0, 6) : p.name.toUpperCase();
    const got = by.get(key);
    if (got) {
      got.pct += p.pct;
      got.classes += 1;
    } else by.set(key, { name: p.name, pct: p.pct, classes: 1 });
  }
  return [...by.values()].sort((a, b) => b.pct - a.pct);
}

export type NportFiling = { accession: string; filed: string; reportDate: string | null; document: string };

/** The latest NPORT-P in a submissions document; null when the fund files none. The primary document is the raw XML, not its styled view. */
export function latestNportOf(submissions: unknown): NportFiling | null {
  const recent = (submissions as { filings?: { recent?: Record<string, unknown[]> } })?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) throw new Error("no recent filings in the submissions document");
  const forms = recent.form as string[];
  let best: NportFiling | null = null;
  forms.forEach((form, i) => {
    if (form !== "NPORT-P") return;
    const filed = String(recent.filingDate?.[i] ?? "");
    const accession = String(recent.accessionNumber?.[i] ?? "");
    const doc = String(recent.primaryDocument?.[i] ?? "primary_doc.xml");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) return;
    if (best && best.filed >= filed) return;
    best = { accession, filed, reportDate: (recent.reportDate?.[i] as string | undefined) || null, document: doc.split("/").pop() || "primary_doc.xml" };
  });
  return best;
}
