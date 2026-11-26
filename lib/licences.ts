/**
 * Which outside sources a deployment may show (Hamza, 9 Nov 2026: "Lawful
 * only" for the beta). A deployment with SOURCES=licensed reads only the
 * sources whose terms let an app run for others show them: the SEC, the US
 * government's series, the New York Fed, Freddie Mac's survey, the OECD, the
 * BIS, the IMF, the ECB and Wikipedia, each credited. Every other feed is
 * shut at the one place it is fetched (`feedShut`, in lib/markets-feed.ts
 * and lib/podcast-feed.ts), and the card that loses it says why. A shut
 * source is never asked, so nothing it holds reaches a shared cache another
 * person could read; that is why the switch is the deployment's, not a
 * person's. The terms were read on 9 Nov 2026
 * (/mnt/project-files/app/invariant-data-without-licences-2026-11-09.md).
 * Pure: no fetch, no server-only import.
 */

export type FeedId =
  | "yahoo"
  | "stooq"
  | "multpl"
  | "cnn"
  | "nasdaq"
  | "google_news"
  | "kalshi"
  | "polymarket"
  | "cboe"
  | "finra"
  | "podscripts"
  | "umich"
  | "fred"
  | "wikipedia"
  | "sec"
  | "nyfed"
  | "bls"
  | "treasury"
  | "fed"
  | "bea"
  | "freddie"
  | "oecd"
  | "bis"
  | "imf"
  | "ecb"
  | "cftc"
  | "ofr";

export type Feed = {
  id: FeedId;
  /** The source as a sentence names it. */
  name: string;
  hosts: readonly string[];
  /** Whether a licensed deployment may show it. */
  licensed: boolean;
  /** Why it is shut, in a clause; for a licensed source, its terms in brief. */
  why: string;
  /** The credit its terms ask for, shown where it is drawn. */
  credit?: string;
};

export const FEEDS: readonly Feed[] = [
  { id: "yahoo", name: "Yahoo Finance", hosts: ["query1.finance.yahoo.com", "query2.finance.yahoo.com", "feeds.finance.yahoo.com"], licensed: false, why: "its terms bar showing its prices and news in an app run for others" },
  { id: "stooq", name: "stooq", hosts: ["stooq.com"], licensed: false, why: "its data is for personal use" },
  { id: "multpl", name: "multpl", hosts: ["www.multpl.com"], licensed: false, why: "its tables are not licensed for reuse" },
  { id: "cnn", name: "CNN's fear and greed index", hosts: ["production.dataviz.cnn.io"], licensed: false, why: "CNN does not license it for reuse" },
  { id: "nasdaq", name: "Nasdaq", hosts: ["api.nasdaq.com"], licensed: false, why: "its terms bar reusing its calendar, market values and analysts' estimates" },
  { id: "google_news", name: "Google News", hosts: ["news.google.com"], licensed: false, why: "it bars automated reading" },
  { id: "kalshi", name: "Kalshi", hosts: ["api.elections.kalshi.com", "trading-api.kalshi.com"], licensed: false, why: "its data is licensed for its members' own trading" },
  { id: "polymarket", name: "Polymarket", hosts: ["gamma-api.polymarket.com", "clob.polymarket.com"], licensed: false, why: "its terms cover its market data too" },
  { id: "cboe", name: "Cboe", hosts: ["cdn.cboe.com", "www.cboe.com"], licensed: false, why: "it charges for passing its quotes on" },
  { id: "finra", name: "FINRA's short interest file", hosts: ["cdn.finra.org"], licensed: false, why: "FINRA lets an app pass it on only through its API, which is not set up yet" },
  { id: "podscripts", name: "podscripts.co", hosts: ["podscripts.co"], licensed: false, why: "its transcripts are not licensed for reuse" },
  { id: "umich", name: "The University of Michigan's consumer sentiment", hosts: ["www.sca.isr.umich.edu", "data.sca.isr.umich.edu"], licensed: false, why: "its free licence bars using it in a commercial product" },
  { id: "fred", name: "FRED", hosts: ["fred.stlouisfed.org"], licensed: true, why: "only its US government series may be shown", credit: "FRED, Federal Reserve Bank of St. Louis" },
  { id: "wikipedia", name: "Wikipedia", hosts: ["en.wikipedia.org"], licensed: true, why: "CC BY-SA, with credit", credit: "Wikipedia, CC BY-SA 4.0" },
  { id: "sec", name: "SEC EDGAR", hosts: ["www.sec.gov", "data.sec.gov", "efts.sec.gov"], licensed: true, why: "public filings", credit: "SEC EDGAR" },
  { id: "nyfed", name: "the New York Fed", hosts: ["markets.newyorkfed.org"], licensed: true, why: "its terms let it be used for business, with notice", credit: "Federal Reserve Bank of New York, subject to the Terms of Use at newyorkfed.org (its repo rates with data from DTCC Solutions LLC); Invariant is not affiliated with the New York Fed" },
  { id: "bls", name: "the BLS", hosts: ["api.bls.gov"], licensed: true, why: "US government work", credit: "US Bureau of Labor Statistics" },
  { id: "treasury", name: "the US Treasury", hosts: ["api.fiscaldata.treasury.gov", "home.treasury.gov", "ticdata.treasury.gov"], licensed: true, why: "US government work", credit: "US Department of the Treasury" },
  { id: "fed", name: "the Federal Reserve", hosts: ["www.federalreserve.gov"], licensed: true, why: "public domain, citing the Board", credit: "Board of Governors of the Federal Reserve System" },
  { id: "bea", name: "the BEA", hosts: ["apps.bea.gov", "www.bea.gov"], licensed: true, why: "US government work", credit: "US Bureau of Economic Analysis" },
  { id: "freddie", name: "Freddie Mac", hosts: ["www.freddiemac.com"], licensed: true, why: "its survey may be published with attribution", credit: "Freddie Mac Primary Mortgage Market Survey" },
  { id: "oecd", name: "the OECD", hosts: ["sdmx.oecd.org"], licensed: true, why: "free with credit", credit: "OECD" },
  { id: "bis", name: "the BIS", hosts: ["stats.bis.org"], licensed: true, why: "free with credit", credit: "BIS" },
  { id: "imf", name: "the IMF", hosts: ["www.imf.org"], licensed: true, why: "free with credit", credit: "IMF" },
  { id: "ecb", name: "the ECB", hosts: ["www.ecb.europa.eu"], licensed: true, why: "free for any use, the source quoted", credit: "ECB statistics" },
  { id: "cftc", name: "the CFTC", hosts: ["publicreporting.cftc.gov"], licensed: true, why: "public domain, with acknowledgement", credit: "US Commodity Futures Trading Commission, Commitments of Traders" },
  { id: "ofr", name: "the OFR", hosts: ["data.financialresearch.gov"], licensed: true, why: "US government work, with credit", credit: "Office of Financial Research, Money Market Fund Monitor" },
];

/**
 * FRED's series that are US government work (the Fed's H.15 yields, the BLS,
 * the Fed's own indexes); the rest belong to their publishers (Cboe's VIX,
 * S&P's index, ICE's spreads) and stay shut.
 */
export const FRED_PUBLIC: ReadonlySet<string> = new Set(["DGS3MO", "DGS2", "DGS5", "DGS10", "DGS30", "EFFR", "SOFR", "DTWEXBGS", "CPIAUCNS", "UNRATE", "MORTGAGE30US", "DCOILWTICO"]);

type Env = Record<string, string | undefined>;

/** Whether this deployment shows licensed sources alone (SOURCES=licensed, the beta's). */
export const licensedOnly = (env: Env = process.env): boolean => (env.SOURCES ?? "").trim().toLowerCase() === "licensed";

export function feedOf(url: string): Feed | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return FEEDS.find((f) => f.hosts.includes(host)) ?? null;
}

/** The words a shut source leaves on its card. Every one says "is not shown in the beta", which `isShut` reads. */
export const shutWords = (name: string, why: string): string => `${name} is not shown in the beta: ${why}.`;

const SHUT_MARK = " is not shown in the beta";

/** Whether a problem sentence is a source shut by licence, not a failure. */
export const isShut = (problem: string): boolean => problem.includes(SHUT_MARK);

/**
 * Null when the address may be asked; else the sentence its card shows.
 * A host on no list is shut too, so a new source is never shown by default.
 */
export function feedShut(url: string, env: Env = process.env): string | null {
  if (!licensedOnly(env)) return null;
  const f = feedOf(url);
  if (!f) {
    let host = "This source";
    try {
      host = new URL(url).hostname;
    } catch {
      // the words stay general
    }
    return shutWords(host, "it is not on the list of sources the beta may show");
  }
  if (f.id === "fred") {
    let id: string | null = null;
    try {
      id = new URL(url).searchParams.get("id");
    } catch {
      id = null;
    }
    return id && FRED_PUBLIC.has(id) ? null : shutWords(`FRED's ${id ?? "series"}`, "the series belongs to its publisher");
  }
  return f.licensed ? null : shutWords(f.name, f.why);
}

/** Whether a feed by id is open on this deployment. */
export function feedOpen(id: FeedId, env: Env = process.env): boolean {
  if (!licensedOnly(env)) return true;
  return FEEDS.find((f) => f.id === id)?.licensed ?? false;
}

/** The sentence for a feed by id, or null when it is open. */
export function feedShutById(id: FeedId, env: Env = process.env): string | null {
  if (feedOpen(id, env)) return null;
  const f = FEEDS.find((x) => x.id === id);
  return f ? shutWords(f.name, f.why) : null;
}

/**
 * Many problems that only say their sources are shut, as one sentence with
 * the sources named once; the rest kept as they are. `what` names the items
 * ("indicators", "companies").
 */
export function foldShut(problems: readonly string[], what: string): string[] {
  const shut = problems.filter(isShut);
  if (shut.length <= 1) return [...problems];
  const names = FEEDS.filter((f) => !f.licensed && shut.some((p) => p.includes(`${f.name}${SHUT_MARK}`))).map((f) => f.name);
  const fred = shut.some((p) => /FRED's \S+ is not shown in the beta/.test(p));
  const named = [...names, ...(fred ? ["FRED's privately published series"] : [])];
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : (named[0] ?? "their sources");
  return [...problems.filter((p) => !isShut(p)), `${shut.length} ${what} are not shown in the beta: their sources' terms bar it (${list}).`];
}

/** The credits for the licensed sources a card drew, in one line. */
export function creditsFor(ids: readonly FeedId[]): string {
  const credits = [...new Set(ids.map((id) => FEEDS.find((f) => f.id === id)?.credit).filter((c): c is string => !!c))];
  return credits.length ? `Source: ${credits.join("; ")}.` : "";
}

/** The credits for the sources a reading names ("the US Treasury", "FRED (earlier reading)"), each licensed source once. */
export function creditsForNames(names: readonly string[]): string {
  return creditsFor(FEEDS.filter((f) => f.licensed && names.some((n) => n.startsWith(f.name))).map((f) => f.id));
}
