import { InsiderPeriods, type InsiderWindow } from "@/components/company/insider-periods";
import { INSIDER_PERIODS, insiderPeriodDays, insiderView, LYNCH_QUOTE, type InsiderPeriod, type Insiders } from "@/lib/insiders";
import { FINRA_PAGE, shortChangePct, type ShortInterest } from "@/lib/short-interest";
import { addDaysTo, longDate } from "@/lib/time";

const count = (n: number) => Math.round(n).toLocaleString("en-US");


/**
 * What the company's insiders bought and sold on the open market over the
 * past year, from their Form 4s (lib/insiders.ts), under Peter Lynch's line
 * (Hamza, 21 Oct 2026); beside it the short interest FINRA last published.
 */
export function InsidersSection({ symbol, cik, insiders, short, today, demo, foreign = false }: { symbol: string; cik: number | null; insiders: Insiders | null | undefined; short: ShortInterest | null | undefined; today: string; demo: boolean; foreign?: boolean }) {
  // Each window the card offers, worked out here so the switch on the card needs no trip to the server.
  const windows = insiders
    ? (Object.fromEntries(
        INSIDER_PERIODS.map((p) => {
          const days = insiderPeriodDays(p.key, today);
          return [p.key, { from: addDaysTo(today, -days), days, v: insiderView(insiders, today, days)! }];
        }),
      ) as Record<InsiderPeriod, InsiderWindow>)
    : null;
  const filings = cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40` : null;
  const change = short ? shortChangePct(short) : null;
  return (
    <>
      <section id="insiders" className="mb-4 grid scroll-mt-20 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card px-4 py-4 lg:col-span-2 lg:px-6">
          <h2 className="section-header mb-2">Insiders</h2>
          <blockquote className="border-l-2 border-accent pl-3 text-subhead italic text-text-secondary">
            &ldquo;{LYNCH_QUOTE.words}&rdquo;
            <footer className="mt-1 text-footnote not-italic text-text-tertiary">{LYNCH_QUOTE.by}</footer>
          </blockquote>
          {windows ? (
            <InsiderPeriods
              windows={windows}
              today={today}
              symbol={symbol}
              footnote={
                <>
                  {insiders?.others ? `${count(insiders.others)} awards, option exercises, shares withheld for tax and gifts on the forms read are left out. ` : ""}
                  {insiders?.waiting ? `${insiders.waiting} older forms are read over the next mornings. ` : ""}
                  {demo ? "Illustrative for the demo: invented insiders and trades, not the SEC's forms." : filings ? (
                    <a href={filings} target="_blank" rel="noreferrer" className="text-accent-text">
                      Every Form 4 at the SEC
                    </a>
                  ) : null}
                </>
              }
            />
          ) : (
            <p className="mt-4 text-footnote text-text-secondary">{foreign && !insiders?.read.length ? "It files with the SEC as a foreign private issuer (20-F and 6-K), and the SEC asks no Form 4 of such a company's insiders; their dealings are reported at home, not here." : demo ? "The demo keeps no insider forms for this company." : "The insiders' Form 4s are read with the filings each morning, for every holding and watchlist company the SEC lists."}</p>
          )}
        </div>
        <div className="card px-4 py-4 lg:px-6">
          <h2 className="section-header mb-2">Short interest</h2>
          {short ? (
            <>
              <p className="data text-large-title font-semibold">{short.pctOfShares !== null ? `${short.pctOfShares.toFixed(2)}%` : `${count(short.short)}`}</p>
              <p className="text-footnote text-text-secondary">{short.pctOfShares !== null ? `of the shares outstanding, ${count(short.short)} shares` : "shares sold short; the filings count other shares than the listing's"}</p>
              <dl className="mt-3 space-y-1 text-footnote">
                <div className="flex justify-between gap-3 border-b border-dotted border-hairline pb-1">
                  <dt className="text-text-secondary">Days to cover</dt>
                  <dd className="data">{short.daysToCover !== null ? short.daysToCover.toFixed(1) : "n/a"}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-dotted border-hairline pb-1">
                  <dt className="text-text-secondary">Since the date before</dt>
                  <dd className={`data ${change !== null && change > 0 ? "text-danger" : change !== null && change < 0 ? "text-ok" : ""}`}>{change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : "n/a"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Settlement date</dt>
                  <dd>{longDate(short.settlement)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-caption text-text-tertiary">
                {demo ? "Illustrative for the demo, not FINRA's figures. " : ""}Brokers report short positions to FINRA twice a month; it publishes them about a week and a half later.{" "}
                <a href={FINRA_PAGE} target="_blank" rel="noreferrer" className="text-accent-text">
                  FINRA&rsquo;s files
                </a>
              </p>
            </>
          ) : (
            <p className="text-footnote text-text-secondary">{demo ? "The demo reads no short interest for this company." : "FINRA's latest file does not list this company yet; it is read with the filings each morning."}</p>
          )}
        </div>
      </section>
    </>
  );
}

