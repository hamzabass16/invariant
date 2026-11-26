import { z } from "zod";

import { INSIDER_DAYS, insiderView, tradeWords, type Insiders } from "@/lib/insiders";
import { ToolProblem, type McpTool } from "@/lib/mcp-tools";
import type { ReleaseDay } from "@/lib/reaction-history";
import type { ShortInterest } from "@/lib/short-interest";

/**
 * The public research server (Hamza, 23 Oct 2026, after Rallies.AI's MCP):
 * a few read-only tools anyone's Claude can add with no sign-in, on public
 * filings alone: a company's SEC figures, its insiders' Form 4 trades, the
 * short interest FINRA publishes and the days it released its results. No
 * price feed, no person's data, no model; every answer names its source.
 * The person's own server (lib/mcp-tools.ts) stays behind sign-in. Pure:
 * the tools and their words; lib/mcp-research-run.ts reads.
 */

export type ResearchCompany = { ticker: string; name: string; cik: number };

export type ResearchSource = {
  today: string;
  /** Null when the deployment names no contact for the SEC, which then answers nothing. */
  ready: string | null;
  company: (ticker: string) => Promise<ResearchCompany | null>;
  facts: (c: ResearchCompany) => Promise<string>;
  insiders: (c: ResearchCompany) => Promise<Insiders | null>;
  short: (c: ResearchCompany) => Promise<{ row: ShortInterest | null; settlement: string | null }>;
  releases: (c: ResearchCompany) => Promise<ReleaseDay[]>;
};

const ticker = z.object({ ticker: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/).describe("A US-listed company's ticker, e.g. MA or BRK.B.") });
type Ticker = z.infer<typeof ticker>;

async function companyOf(src: ResearchSource, a: Ticker): Promise<ResearchCompany> {
  if (src.ready) throw new ToolProblem(src.ready);
  const c = await src.company(a.ticker.toUpperCase());
  if (!c) throw new ToolProblem(`SEC EDGAR lists no company under ${a.ticker.toUpperCase()}; a foreign listing or a fund files nothing there.`);
  return c;
}

const usd = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}bn` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/** The insiders' year in text. */
export function insidersText(c: ResearchCompany, insiders: Insiders | null, today: string): string {
  const v = insiderView(insiders, today);
  if (!v) return `${c.name} (${c.ticker}): no Form 4 could be read.`;
  const lines = [`${c.name} (${c.ticker}), insiders' open-market trades over the past ${INSIDER_DAYS} days, from their Form 4s at the SEC:`, `Bought ${usd(v.buys.value)} by ${v.buys.people} insider${v.buys.people === 1 ? "" : "s"} in ${v.buys.trades} trade${v.buys.trades === 1 ? "" : "s"}; sold ${usd(v.sales.value)} by ${v.sales.people} in ${v.sales.trades}; net ${usd(v.net)}.${v.plannedPct !== null ? ` ${Math.round(v.plannedPct)}% of the sales' value under a 10b5-1 plan.` : ""}`];
  for (const t of v.trades.slice(0, 20)) lines.push(`- ${t.date}: ${t.name}, ${t.role}. ${tradeWords(t)}. Filed ${t.filed}.`);
  if (v.trades.length > 20) lines.push(`(${v.trades.length - 20} earlier trades not listed.)`);
  lines.push("Awards, option exercises, shares withheld for tax and gifts are left out (codes other than P and S).");
  return lines.join("\n");
}

/** FINRA's latest short interest in text. */
export function shortText(c: ResearchCompany, s: { row: ShortInterest | null; settlement: string | null }): string {
  const r = s.row;
  if (!r) return `${c.name} (${c.ticker}): not in FINRA's latest short interest file${s.settlement ? ` (settlement ${s.settlement})` : ""}.`;
  const change = r.previous ? ((r.short / r.previous - 1) * 100).toFixed(1) : null;
  return [`${c.name} (${c.ticker}), short interest at settlement ${r.settlement}, from FINRA:`, `${Math.round(r.short).toLocaleString("en-US")} shares short${r.pctOfShares !== null ? `, ${r.pctOfShares.toFixed(2)}% of the shares outstanding the filings report` : ""}${change !== null ? `; ${Number(change) >= 0 ? "+" : ""}${change}% since the date before` : ""}.`, r.daysToCover !== null ? `Days to cover: ${r.daysToCover.toFixed(1)}.` : "", "Brokers report short positions twice a month; FINRA publishes them about a week and a half later."].filter(Boolean).join("\n");
}

/** The results releases in text. */
export function releasesText(c: ResearchCompany, days: readonly ReleaseDay[]): string {
  if (!days.length) return `${c.name} (${c.ticker}): no 8-K with results (item 2.02) in its recent SEC filings; a foreign filer releases on 6-K, which carries no item.`;
  return [`${c.name} (${c.ticker}), results releases from its 8-Ks with item 2.02, by the SEC's acceptance clock (New York):`, ...days.map((d) => `- ${d.date}, ${d.time === "pre" ? "before the close (the session that day trades on it)" : "after the close (the next session trades on it)"}${d.url ? `: ${d.url}` : ""}`)].join("\n");
}

export const RESEARCH_TOOLS: readonly McpTool<ResearchSource>[] = [
  {
    name: "company_filings",
    title: "SEC figures",
    description: "A US-listed company's figures from its SEC filings (XBRL company facts): five calendar years and the trailing twelve months of revenue, income, cash flow, shares, dividends and balances, as a table. Public filings only; nothing estimated.",
    input: ticker,
    open: true,
    run: async (src, a: Ticker) => {
      const c = await companyOf(src, a);
      return `${c.name} (${c.ticker})\n${await src.facts(c)}\nSource: SEC EDGAR company facts.`;
    },
  },
  {
    name: "insider_trades",
    title: "Insider trades",
    description: "A US-listed company's insiders' open-market purchases and sales (Form 4 codes P and S) over the past year, from the SEC: the totals, the share under 10b5-1 plans and the latest trades with who, their role, shares, price and dates.",
    input: ticker,
    open: true,
    run: async (src, a: Ticker) => {
      const c = await companyOf(src, a);
      return insidersText(c, await src.insiders(c), src.today);
    },
  },
  {
    name: "short_interest",
    title: "Short interest",
    description: "The short interest FINRA last published for a US-listed company: shares short, the share of shares outstanding, the change since the date before and days to cover.",
    input: ticker,
    open: true,
    run: async (src, a: Ticker) => {
      const c = await companyOf(src, a);
      return shortText(c, await src.short(c));
    },
  },
  {
    name: "results_dates",
    title: "Results dates",
    description: "The days a US-listed company released its quarterly results over the past two years or so, from its 8-Ks with item 2.02, each before or after the close by the SEC's acceptance time, with the filing's address.",
    input: ticker,
    open: true,
    run: async (src, a: Ticker) => {
      const c = await companyOf(src, a);
      return releasesText(c, await src.releases(c));
    },
  },
];

export const RESEARCH_INSTRUCTIONS = [
  "Invariant research: public filings for any US-listed company, with no sign-in.",
  "Every figure comes from the SEC (company facts, Form 4, 8-K) or FINRA (short interest) and is quoted as the tool returns it; never estimate, recall or add a figure the tools did not return.",
  "Nothing here reads anyone's portfolio, a price feed or a model, and nothing is kept. Write plainly; no advice to buy or sell.",
  "A person's own Invariant, with their holdings, methodology and theses, is a separate connector that asks them to sign in.",
].join("\n");
