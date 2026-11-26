import type { Route } from "next";

import { ScreenFreshness } from "@/components/app/screen-freshness";
import { buttonStyles } from "@/components/ui/button";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { companyHref } from "@/lib/company";
import { searchCompanyList } from "@/lib/edgar";
import { searchCompanies, SEARCH_MAX, type CompanyRow } from "@/lib/edgar-facts";
import { readableSymbols } from "@/lib/filings";
import { SyncError } from "@/lib/sync-error";
import { fillsOf } from "@/lib/trades";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Companies · Invariant" };

const field = "block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/**
 * Companies (Hamza, 21 Oct 2026): the way into any company's page. A search
 * over the SEC's list of every company that files with it, by ticker or name
 * (lib/edgar-facts.ts searchCompanies; the words typed are matched here and
 * sent nowhere), then the person's holdings, watchlist and the companies
 * they traded before, each opening its page. A company neither held nor
 * watched is read when its page is opened (lib/company-run.ts
 * publicCompanyEntry). The demo searches the companies it carries.
 */
export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const typed = String((await searchParams).q ?? "").trim().slice(0, 60);
  const book = ws.fullBook ?? ws.book;
  const contact = ws.preferences.edgarContact ?? null;
  const names = new Map<string, string>();
  for (const e of Object.values(ws.filings?.bySymbol ?? {})) if (e.name) names.set((e.ticker ?? e.symbol).toUpperCase(), e.name);
  for (const h of book?.holdings ?? []) if (h.name && h.name !== h.symbol) names.set(h.symbol.toUpperCase(), h.name);

  const listed = book ? readableSymbols(book) : [];
  const total = book?.holdings.reduce((s, h) => s + Math.max(0, h.value), 0) ?? 0;
  const weightOf = (symbol: string) => (total > 0 ? ((book?.holdings ?? []).filter((h) => h.symbol.toUpperCase() === symbol).reduce((s, h) => s + h.value, 0) / total) * 100 : null);
  const held = listed.map((s) => ({ symbol: s, weight: weightOf(s) })).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const heldSet = new Set(listed);
  const watched = Object.keys(ws.records.bySymbol)
    .map((s) => s.toUpperCase())
    .filter((s) => TICKER.test(s) && !heldSet.has(s))
    .sort();
  const watchedSet = new Set(watched);
  const traded = [...new Set(book ? fillsOf(book).map((f) => f.symbol.toUpperCase()) : [])].filter((s) => TICKER.test(s) && !heldSet.has(s) && !watchedSet.has(s)).sort();

  // The search: the SEC's whole list in the app, the demo's own companies in the demo.
  let results: CompanyRow[] = [];
  let problem: string | null = null;
  if (typed) {
    if (demo) {
      const own = [...new Set([...listed, ...watched, ...traded])].map((s) => ({ cik: 0, ticker: s, title: names.get(s) ?? s }));
      results = searchCompanies(own.map((r, i) => ({ ...r, cik: i + 1 })), typed);
    } else if (contact) {
      try {
        results = await searchCompanyList(typed, contact);
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        problem = e.message;
      }
    }
  }
  const asTicker = typed.toUpperCase();
  const where = (s: string) => (heldSet.has(s) ? "Held" : watchedSet.has(s) ? "Watched" : null);

  const card = (symbol: string, detail: string | undefined, value?: string) => <ListLinkRow key={symbol} href={companyHref(symbol) as Route} label={<span className="data font-semibold">{symbol}</span>} detail={detail} value={value} />;

  return (
    <>
      <PageHeader title="Companies" subtitle="Any public company, your holdings and your watchlist" fresh={<ScreenFreshness />} />
      <PageBody>
        <form method="get" action="/companies" className="card mb-8 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end lg:px-6">
          <label className="min-w-0 flex-1 text-footnote text-text-secondary">
            Ticker or company name
            <input name="q" defaultValue={typed} placeholder="NVDA, Costco, Taiwan Semiconductor" autoComplete="off" maxLength={60} className={`${field} mt-1`} />
          </label>
          <button type="submit" className={buttonStyles({ variant: "primary", size: "md" })}>
            Search
          </button>
        </form>

        {typed ? (
          <ListSection grid={results.length > 0} header={results.length ? `Matches · ${results.length}${results.length >= SEARCH_MAX ? "+" : ""}` : "Matches"} footer={demo ? "The demo searches the companies it carries." : `From the SEC's list of every company that files with it, the largest first.${results.length >= SEARCH_MAX ? " Type more of the name to narrow it." : ""}`}>
            {results.length ? (
              results.map((r) => card(r.ticker, r.title, where(r.ticker) ?? undefined))
            ) : problem ? (
              <ListRow wrap label={problem} />
            ) : !demo && !contact ? (
              TICKER.test(asTicker) ? (
                <ListLinkRow href={companyHref(asTicker) as Route} label={`Open ${asTicker}`} detail="Confirm the contact the SEC will see, on Setup under Company filings, to search by name and read any company's filings." />
              ) : (
                <ListRow wrap label="Confirm the contact the SEC will see, on Setup under Company filings, and every company that files with the SEC can be found by name." />
              )
            ) : (
              <ListRow wrap label={`No company the SEC lists matches "${typed}". A company listed only abroad files nothing with the SEC.`} />
            )}
          </ListSection>
        ) : null}

        <ListSection grid={held.length > 0} header={`Your holdings · ${held.length}`}>
          {held.length ? held.map((h) => card(h.symbol, names.get(h.symbol), h.weight !== null ? `${h.weight.toFixed(1)}%` : undefined)) : <ListRow wrap label="No listed company in the book yet." />}
        </ListSection>

        <ListSection grid={watched.length > 0} header={`Your watchlist · ${watched.length}`} footer={watched.length ? undefined : "Add to watchlist on a company's page puts it here, and its filings are then read each morning."}>
          {watched.length ? watched.map((s) => card(s, names.get(s) ?? "On your watchlist")) : <ListRow wrap label="Nothing on the watchlist yet." />}
        </ListSection>

        {traded.length ? (
          <ListSection grid header={`Traded before · ${traded.length}`}>
            {traded.map((s) => card(s, names.get(s) ?? "No longer held"))}
          </ListSection>
        ) : null}

        <p className="px-1 text-caption text-text-tertiary">Each page is the company&rsquo;s filings, price, insiders, short interest and news. Not investment advice.</p>
      </PageBody>
    </>
  );
}
