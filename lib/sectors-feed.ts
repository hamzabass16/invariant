import "server-only";

import { cache } from "react";

import { parseGicsTable, parseTickerTable, type GicsRow } from "@/lib/sectors";
import { feedShut } from "@/lib/licences";

/**
 * The official GICS sector and sub-industry of the large US listings, read
 * off two public index constituents pages (the S&P 500 and the Nasdaq-100
 * lists on Wikipedia), kept a day by Next.js. Nothing about the person goes
 * out: the two URLs are fixed and carry no symbol. A page that cannot be read
 * or has lost its table is a sentence in `problems`, and every company it
 * would have covered falls back to its SEC industry code (lib/sectors.ts);
 * nothing is guessed. Read only when filings are read, never per page.
 */

const LISTS = [
  { name: "S&P 500", url: "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies" },
  // The members moved off the index's own page; the list classifies by ICB, so it gives members and no sectors.
  { name: "Nasdaq-100", url: "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies" },
] as const;
export type ListName = (typeof LISTS)[number]["name"];

const REVALIDATE_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 15_000;

export type GicsIndex = {
  /** By SEC-style ticker; the S&P 500 row wins when both lists carry a company. */
  by: Map<string, GicsRow & { list: ListName }>;
  /** The lists that were read. */
  read: ListName[];
  /** Each list's own tickers, a company on both in both. */
  members: Record<ListName, string[]>;
  /** One sentence per list that was not. */
  problems: string[];
};

async function readList(list: (typeof LISTS)[number]): Promise<{ rows: GicsRow[]; tickers: string[] } | { problem: string }> {
  const shut = feedShut(list.url);
  if (shut) return { problem: shut };
  let res: Response;
  try {
    res = await fetch(list.url, { next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "text/html", "user-agent": "Invariant sector lookup (reads two index lists once a day)" } });
  } catch {
    return { problem: `The ${list.name} list could not be reached.` };
  }
  if (!res.ok) return { problem: `The ${list.name} list answered ${res.status}.` };
  let html: string;
  try {
    html = await res.text();
  } catch {
    return { problem: `The ${list.name} list could not be read.` };
  }
  try {
    const rows = parseGicsTable(html);
    return { rows, tickers: rows.map((r) => r.ticker) };
  } catch {
    // No GICS columns: the members alone, and every sector falls back to the SEC industry code.
  }
  try {
    return { rows: [], tickers: parseTickerTable(html) };
  } catch {
    return { problem: `The ${list.name} page has no constituents table any more; sectors fall back to the SEC industry code.` };
  }
}

/** Both lists, read once per request; never throws. */
export const loadGics = cache(async (): Promise<GicsIndex> => {
  const by = new Map<string, GicsRow & { list: ListName }>();
  const read: ListName[] = [];
  const problems: string[] = [];
  const members: Record<ListName, string[]> = { "S&P 500": [], "Nasdaq-100": [] };
  const results = await Promise.all(LISTS.map(async (l) => ({ l, r: await readList(l) })));
  for (const { l, r } of results) {
    if ("problem" in r) {
      problems.push(r.problem);
      continue;
    }
    read.push(l.name);
    members[l.name] = r.tickers;
    for (const row of r.rows) if (!by.has(row.ticker)) by.set(row.ticker, { ...row, list: l.name });
  }
  return { by, read, members, problems };
});
