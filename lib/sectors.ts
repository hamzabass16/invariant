/**
 * Sectors, two ways, pure. First the official GICS sector and sub-industry
 * read off a public index constituents table (the S&P 500 and Nasdaq-100
 * lists on Wikipedia, fetched by lib/sectors-feed.ts), which covers most
 * large US listings. Then, for a company no list carries, a sector from the
 * industry code the SEC files it under (the four-digit Standard Industrial
 * Classification on its EDGAR submissions), named after the eleven GICS
 * sectors; that is the nearest the SEC's code allows, so a company can land
 * where the SEC's code puts it rather than where an index would (a card
 * network filed as business services). Every sector says which it is, and
 * the owner can set their own under Customise, Records. Nothing of anyone's
 * portfolio.
 */

export const SECTORS = ["Energy", "Materials", "Industrials", "Consumer Discretionary", "Consumer Staples", "Health Care", "Financials", "Information Technology", "Communication Services", "Utilities", "Real Estate"] as const;
export type Sector = (typeof SECTORS)[number];

/** Codes whose sector is not what their range says. */
const BY_CODE: Record<number, Sector> = {
  // Drugs, medical and dental supplies are health care, not chemicals or instruments.
  2830: "Health Care", 2831: "Health Care", 2833: "Health Care", 2834: "Health Care", 2835: "Health Care", 2836: "Health Care",
  3841: "Health Care", 3842: "Health Care", 3843: "Health Care", 3844: "Health Care", 3845: "Health Care", 3851: "Health Care",
  5047: "Health Care", 5122: "Health Care", 8731: "Health Care",
  // Soap, cosmetics, food, drink and tobacco are staples; so are food stores, drug stores and variety stores.
  2840: "Consumer Staples", 2841: "Consumer Staples", 2842: "Consumer Staples", 2844: "Consumer Staples",
  5140: "Consumer Staples", 5141: "Consumer Staples", 5149: "Consumer Staples", 5331: "Consumer Staples", 5399: "Consumer Staples", 5411: "Consumer Staples", 5412: "Consumer Staples", 5912: "Consumer Staples",
  // Computers, electronics, semiconductors and their equipment, software and data processing.
  3570: "Information Technology", 3571: "Information Technology", 3572: "Information Technology", 3575: "Information Technology", 3576: "Information Technology", 3577: "Information Technology", 3578: "Information Technology", 3579: "Information Technology",
  3559: "Information Technology", 3661: "Information Technology", 3663: "Information Technology", 3669: "Information Technology", 3672: "Information Technology", 3674: "Information Technology", 3677: "Information Technology", 3678: "Information Technology", 3679: "Information Technology",
  3812: "Industrials", 3821: "Information Technology", 3823: "Information Technology", 3825: "Information Technology", 3826: "Health Care", 3827: "Information Technology", 3829: "Information Technology", 3861: "Information Technology",
  5045: "Information Technology", 7371: "Information Technology", 7372: "Information Technology", 7373: "Information Technology", 7374: "Information Technology", 7377: "Information Technology",
  // Internet platforms, publishing, advertising, telecoms, broadcasting and entertainment.
  2711: "Communication Services", 2721: "Communication Services", 2731: "Communication Services", 2741: "Communication Services",
  4812: "Communication Services", 4813: "Communication Services", 4822: "Communication Services", 4832: "Communication Services", 4833: "Communication Services", 4841: "Communication Services", 4899: "Communication Services",
  7310: "Communication Services", 7311: "Communication Services", 7370: "Communication Services", 7812: "Communication Services", 7819: "Communication Services", 7822: "Communication Services", 7829: "Communication Services", 7841: "Communication Services",
  // Cars, household goods, apparel, footwear, toys, hotels, restaurants, travel and education are discretionary.
  2510: "Consumer Discretionary", 2511: "Consumer Discretionary", 3021: "Consumer Discretionary", 3630: "Consumer Discretionary", 3634: "Consumer Discretionary", 3651: "Consumer Discretionary", 3711: "Consumer Discretionary", 3713: "Consumer Discretionary", 3714: "Consumer Discretionary", 3716: "Consumer Discretionary", 3751: "Consumer Discretionary", 3873: "Consumer Discretionary", 3911: "Consumer Discretionary", 3942: "Consumer Discretionary", 3944: "Consumer Discretionary", 3949: "Consumer Discretionary",
  4700: "Consumer Discretionary", 4724: "Consumer Discretionary", 4725: "Consumer Discretionary", 7011: "Consumer Discretionary", 7990: "Consumer Discretionary", 7997: "Consumer Discretionary", 8200: "Consumer Discretionary", 8299: "Consumer Discretionary",
  // Oil and gas, coal and refining are energy; metals, mining, chemicals, paper, glass and steel are materials.
  1200: "Energy", 1220: "Energy", 1221: "Energy", 1311: "Energy", 1381: "Energy", 1382: "Energy", 1389: "Energy", 2911: "Energy", 5171: "Energy", 5172: "Energy",
  // Waste, staffing, engineering, consulting and business services are industrials.
  4953: "Industrials", 4955: "Industrials", 7320: "Industrials", 7330: "Industrials", 7331: "Industrials", 7340: "Industrials", 7350: "Industrials", 7359: "Industrials", 7361: "Industrials", 7363: "Industrials", 7380: "Industrials", 7381: "Industrials", 7389: "Industrials", 8700: "Industrials", 8711: "Industrials", 8741: "Industrials", 8742: "Industrials", 8744: "Industrials",
  // Real estate operators and investment trusts.
  6500: "Real Estate", 6510: "Real Estate", 6512: "Real Estate", 6513: "Real Estate", 6519: "Real Estate", 6531: "Real Estate", 6552: "Real Estate", 6798: "Real Estate",
};

/** Ranges of the SIC's divisions and major groups, first match wins after the codes above. */
const BY_RANGE: [number, number, Sector][] = [
  [100, 999, "Consumer Staples"], // agriculture
  [1000, 1099, "Materials"], // metal mining
  [1200, 1399, "Energy"], // coal, oil and gas
  [1400, 1499, "Materials"], // nonmetallic minerals
  [1500, 1799, "Industrials"], // construction
  [2000, 2199, "Consumer Staples"], // food, drink, tobacco
  [2200, 2399, "Consumer Discretionary"], // textiles and apparel
  [2400, 2499, "Materials"], // lumber
  [2500, 2599, "Consumer Discretionary"], // furniture
  [2600, 2699, "Materials"], // paper
  [2700, 2799, "Communication Services"], // printing and publishing
  [2800, 2899, "Materials"], // chemicals
  [2900, 2999, "Energy"], // petroleum refining
  [3000, 3099, "Materials"], // rubber and plastics
  [3100, 3199, "Consumer Discretionary"], // leather and footwear
  [3200, 3399, "Materials"], // stone, glass, primary metals
  [3400, 3599, "Industrials"], // fabricated metal, machinery
  [3600, 3699, "Information Technology"], // electronic equipment
  [3700, 3799, "Industrials"], // transportation equipment
  [3800, 3899, "Industrials"], // instruments
  [3900, 3999, "Consumer Discretionary"], // miscellaneous manufacturing
  [4000, 4799, "Industrials"], // transportation
  [4800, 4899, "Communication Services"],
  [4900, 4999, "Utilities"],
  [5000, 5199, "Industrials"], // wholesale: trading companies and distributors
  [5200, 5999, "Consumer Discretionary"], // retail
  [6000, 6799, "Financials"],
  [7000, 7099, "Consumer Discretionary"], // hotels
  [7200, 7299, "Consumer Discretionary"], // personal services
  [7300, 7399, "Industrials"], // business services
  [7500, 7999, "Consumer Discretionary"], // repair, motion pictures, recreation
  [8000, 8099, "Health Care"],
  [8100, 8999, "Industrials"], // legal, engineering, management services
];

/** The sector for an SIC code; null when the code is unknown or outside the ranges (public administration, conglomerates). */
export function sectorOfSic(sic: number | null | undefined): Sector | null {
  if (sic === null || sic === undefined || !Number.isInteger(sic)) return null;
  const direct = BY_CODE[sic];
  if (direct) return direct;
  for (const [lo, hi, sector] of BY_RANGE) if (sic >= lo && sic <= hi) return sector;
  return null;
}

/** The wording shown beside the sectors wherever they appear. */
export const SECTOR_BASIS = "GICS from the S&P 500 and Nasdaq-100 lists where listed, else GICS-style from the SEC industry code; your own under Customise, Records";
/** The basis written on a filings entry whose sector came from the SEC's code. */
export const SIC_BASIS = "SEC industry code, GICS-style";

// ---------------------------------------------------------------------------
// GICS from an index constituents table

/** `name` is the company as the list writes it ("Apple Inc."), null when the list has no such column. */
export type GicsRow = { ticker: string; sector: Sector; subIndustry: string | null; name?: string | null };

const ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—" };

/** The text of an HTML fragment: tags gone, entities decoded, whitespace collapsed. */
export function htmlText(fragment: string): string {
  return fragment
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** A list's ticker in the SEC's spelling: upper case, a share class after a hyphen (BRK.B is BRK-B). */
export const secTicker = (t: string) => t.trim().toUpperCase().replace(/\./g, "-");

/**
 * The GICS rows of an index constituents page: the first table whose header
 * has a ticker (or symbol) column, a GICS sector column and, when present, a
 * GICS sub-industry column, one row per company, the first row for a ticker
 * winning. A sector the eleven do not name is skipped, never guessed. Throws
 * when the page has no such table, so a changed page never reads as an
 * empty index.
 */
export function parseGicsTable(html: string): GicsRow[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue;
    const cells = (row: string) => (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(htmlText);
    const head = cells(rows[0] ?? "").map((h) => h.toLowerCase());
    const tickerCol = head.findIndex((h) => /^(ticker|symbol)/.test(h));
    const sectorCol = head.findIndex((h) => /gics\s*sector/.test(h));
    const subCol = head.findIndex((h) => /gics\s*sub/.test(h));
    const nameCol = head.findIndex((h) => /^(security|company|name)/.test(h));
    if (tickerCol < 0 || sectorCol < 0) continue;
    const out: GicsRow[] = [];
    const seen = new Set<string>();
    for (const row of rows.slice(1)) {
      const c = cells(row);
      const ticker = secTicker(c[tickerCol] ?? "");
      const sector = SECTORS.find((s) => s.toLowerCase() === (c[sectorCol] ?? "").toLowerCase());
      if (!ticker || !/^[A-Z][A-Z0-9-]{0,9}$/.test(ticker) || !sector || seen.has(ticker)) continue;
      seen.add(ticker);
      out.push({ ticker, sector, subIndustry: subCol >= 0 && c[subCol] ? c[subCol].slice(0, 80) : null, name: nameCol >= 0 && c[nameCol] ? c[nameCol].slice(0, 80) : null });
    }
    if (out.length) return out;
  }
  throw new Error("The page has no constituents table with ticker and GICS sector columns.");
}

/**
 * The tickers of an index's constituents table when it carries no GICS
 * columns (the Nasdaq-100 list classifies by ICB): the first table with a
 * ticker or symbol column and at least `min` rows. Throws when there is none.
 */
export function parseTickerTable(html: string, min = 50): string[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const cells = (row: string) => (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(htmlText);
    const col = cells(rows[0] ?? "").findIndex((h) => /^(ticker|symbol)/i.test(h));
    if (col < 0) continue;
    const out = [...new Set(rows.slice(1).map((r) => secTicker(cells(r)[col] ?? "")).filter((t) => /^[A-Z][A-Z0-9-]{0,9}$/.test(t)))];
    if (out.length >= min) return out;
  }
  throw new Error("The page has no constituents table with a ticker column.");
}

/** Weights summed by sector, largest first, from rows that carry a weight (a percentage) and a sector or null ("No sector yet"). */
export function sectorWeights(rows: readonly { symbol: string; weight: number; sector: string | null }[]): { sector: string; weight: number; symbols: string[] }[] {
  const by = new Map<string, { sector: string; weight: number; symbols: string[] }>();
  for (const r of rows) {
    const key = r.sector ?? "No sector yet";
    const row = by.get(key) ?? { sector: key, weight: 0, symbols: [] };
    row.weight += r.weight;
    row.symbols.push(r.symbol);
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => (a.sector === "No sector yet" ? 1 : b.sector === "No sector yet" ? -1 : b.weight - a.weight));
}
