import "server-only";

import { unstable_cache } from "next/cache";

import { companyFeed, newsFrom, REPORT_FORMS, reportsFrom, type CompanyNews, type NewsItem } from "@/lib/company-news";
import { earningsSubjects, latestReports, reportKey, type EarningsFile } from "@/lib/earnings";
import { companySubmissions, filingLink, lookupCompany } from "@/lib/edgar";
import { loadCompanyHeadlines } from "@/lib/markets-feed";
import { SyncError } from "@/lib/sync-error";
import type { Workspace } from "@/lib/workspace";

/** The page waits this long for the SEC's lists; what is not in by then is read behind it and shown on the next visit. */
const REPORTS_BUDGET_MS = 8_000;
/** How long a company's filings list is kept in the shared data cache. */
const REPORTS_REVALIDATE_SECONDS = 60 * 60;

/** A company's filings of the week, from the SEC: public, nothing of anyone's position, kept an hour for everyone. */
export function filingsOfWeek(symbol: string, from: string, contact: NonNullable<Workspace["preferences"]["edgarContact"]>): Promise<NewsItem[]> {
  return unstable_cache(
    async () => {
      const company = await lookupCompany(symbol, contact);
      if (!company) return [];
      return reportsFrom(await companySubmissions(company.cik, contact), symbol, from, (a, d) => filingLink(company.cik, a, d));
    },
    ["company-filings-week", symbol.toUpperCase(), from],
    { revalidate: REPORTS_REVALIDATE_SECONDS },
  )();
}

/** The app's own post-earnings reports of the week, with the release and the filing each one read. */
export function reportsOfEarnings(file: EarningsFile | null, symbols: ReadonlySet<string>, from: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const r of latestReports(file)) {
    if (!symbols.has(r.symbol.toUpperCase()) || r.status === "waiting") continue;
    const day = r.release?.filed ?? r.filing?.filed ?? r.date;
    if (day >= from) out.push({ symbol: r.symbol.toUpperCase(), kind: "report", title: `Results report${r.quarter ? `, ${r.quarter}` : ""}: ${r.headline}`.slice(0, 300), url: `/earnings?report=${encodeURIComponent(reportKey(r))}#report`, source: "Invariant", at: day, form: null });
    for (const ref of [r.release, r.filing]) if (ref && ref.filed >= from) out.push({ symbol: r.symbol.toUpperCase(), kind: "report", title: REPORT_FORMS[ref.form] ?? ref.form, url: ref.url, source: "SEC EDGAR", at: ref.filed, form: ref.form });
  }
  return out;
}

/**
 * Company news and reports for At the Close (Hamza, 19 Oct 2026): the
 * listed holdings and the watchlist, the past week's headlines from the
 * public feeds, the filings the SEC lists for each (once the person has
 * confirmed the contact the SEC sees, on Research) and the app's own
 * post-earnings reports, the newest first. A source that fails is a
 * sentence; nothing is kept in the vault and nothing of the book is logged.
 */
export async function companyNewsFor(ws: Workspace, earnings: EarningsFile | null, today: string): Promise<CompanyNews & { companies: number }> {
  const subjects = earningsSubjects(ws.book, ws.records.bySymbol, []);
  const symbols = subjects.map((s) => s.symbol.toUpperCase());
  const from = newsFrom(today);
  if (!symbols.length) return { items: [], problems: [], companies: 0 };
  const contact = ws.mode === "drive" ? ws.preferences.edgarContact : null;
  const problems: string[] = [];
  let timedOut = false;
  const budget = new Promise<"budget">((r) => setTimeout(() => r("budget"), REPORTS_BUDGET_MS));
  const filings = contact
    ? Promise.all(
        symbols.map((s) =>
          Promise.race([
            filingsOfWeek(s, from, contact).catch((e) => {
              if (e instanceof SyncError) return e.message;
              return "SEC EDGAR's filings list could not be read.";
            }),
            budget,
          ]),
        ),
      )
    : Promise.resolve([] as (NewsItem[] | string | "budget")[]);
  const [headlines, read] = await Promise.all([loadCompanyHeadlines(symbols, today), filings]);
  problems.push(...headlines.problems);
  const sec: NewsItem[] = [];
  const failed = new Set<string>();
  for (const r of read) {
    if (r === "budget") timedOut = true;
    else if (typeof r === "string") failed.add(r);
    else sec.push(...r);
  }
  if (timedOut) problems.push("Some companies' SEC filings are still being read; they appear on the next visit.");
  problems.push(...failed);
  if (!contact && ws.mode === "drive") problems.push("The SEC's filings are listed once you confirm the contact address the SEC sees, on Research. Results reports are listed already.");
  const own = reportsOfEarnings(earnings, new Set(symbols), from);
  return { items: companyFeed([...sec, ...own, ...headlines.items], today), problems, companies: symbols.length };
}
