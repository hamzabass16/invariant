import { Building } from "lucide-react";
import type { Route } from "next";

import { ScreenFreshness } from "@/components/app/screen-freshness";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { companyHref } from "@/lib/company";
import { creedStyles, groupLabel, lensOf, matchWords, rankByCreed, styleLabel, themeLabel, type CreedRank, type FundCreed, type Lens } from "@/lib/fund-creeds";
import { closenessOf, FUNDS, MIN_JUDGED_PCT, rankFunds, staleFiling, type FundMove, type RankedFund } from "@/lib/funds";
import { screenOf } from "@/lib/screener";
import { slotsOn } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { fundCreedsFor, fundsFor, screen, screenerFor, thesesFor } from "@/lib/workspace";

export const metadata = { title: "Top funds · Invariant" };

const pct = (v: number) => (v === 0 ? "0%" : `${v.toFixed(v < 10 ? 1 : 0)}%`);
const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}bn` : `$${Math.round(v / 1e6)}m`);
/** Open the funds the person's classes come closest to. */
const OPEN = 3;

/**
 * Top funds (lib/funds.ts; Hamza, 21 Oct 2026): well-known long-term
 * managers' latest 13Fs, ranked by how much of each the person's classes
 * would take (the screener's figures, the methodology's recipes), with the
 * overlap with their own book; then each fund's quarter: what it bought,
 * added, trimmed and sold, and its largest positions.
 */
export default async function TopFundsPage() {
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const today = localDay();
  const [{ file, error }, screener, { creeds, error: creedError }, { file: theses }] = await Promise.all([fundsFor(ws), screenerFor(ws), fundCreedsFor(ws), thesesFor(ws)]);
  const m = ws.setup.methodology;
  const book = ws.fullBook ?? ws.book;
  const own = Object.fromEntries(Object.values(ws.filings?.bySymbol ?? {}).filter((e) => !e.error).map((e) => [(e.ticker ?? e.symbol).toUpperCase(), { values: e.values, name: e.name }]));
  const held = new Set(book?.holdings.map((h) => h.symbol.toUpperCase()) ?? []);
  const result = screenOf(m, screener.file, own, held, new Set(), today);
  const labels = new Map((m?.classes ?? []).map((c) => [c.id, c.label]));
  const total = book?.holdings.reduce((s, h) => s + Math.max(0, h.value), 0) ?? 0;
  const weights = new Map<string, number>();
  for (const h of book?.holdings ?? []) if (total > 0 && h.value > 0) weights.set(h.symbol.toUpperCase(), (weights.get(h.symbol.toUpperCase()) ?? 0) + (h.value / total) * 100);
  const ranked = rankFunds(file, (f) => closenessOf(f, (t) => (result ? result.placed[t.toUpperCase()] : undefined), labels, weights), today);
  const slots = slotsOn("top_funds", ws.shown);
  // What each fund says it does, against the person's classes and theses (lib/fund-creeds.ts), with no model.
  const lens = lensOf(m, theses);
  const byCreed = rankByCreed(ranked.map((r) => ({ id: r.fund.id, name: r.fund.name })), creeds, lens);
  const names = new Map(ranked.map((r) => [r.fund.id, r.fund.name]));
  // The demo's fictional companies go by their names; a real one by its ticker.
  const shown = (ticker: string | null, name: string) => (ticker && (!demo || held.has(ticker)) ? ticker : demo ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : (ticker ?? name));
  const link = (ticker: string | null, inner: React.ReactNode) => (ticker && (!demo || held.has(ticker)) ? <a href={companyHref(ticker)} className="text-accent-text">{inner}</a> : inner);

  const card = ({ fund, closeness: c }: RankedFund, i: number) => {
    const f = fund.latest;
    const fit = c?.fit !== null && c?.fit !== undefined && c.judged >= MIN_JUDGED_PCT ? c.fit : null;
    return (
      <ListLinkRow
        key={fund.id}
        href={`#fund-${fund.id}` as Route}
        label={
          <span className="flex flex-wrap items-center gap-2">
            <span className="data text-caption text-text-tertiary">{i + 1}</span>
            <span className="font-semibold">{fund.name}</span>
          </span>
        }
        detail={
          f && staleFiling(fund, today)
            ? `${fund.manager}. Its latest 13F is for the quarter to ${longDate(f.period)}, so it is ranked last; it may no longer file one under this name.`
            : f
            ? `${fund.manager}. ${result ? (fit !== null ? `${pct(fit)} of what the app could judge (${pct(c!.judged)} of the 13F) fits your classes` : `Not ranked: ${pct(c?.judged ?? 0)} of its 13F is in companies the screener has read (the S&P 500 and the Nasdaq-100), under the ${MIN_JUDGED_PCT}% a rank needs`) : "Your methodology sorts no classes"}${c && c.overlap >= 0.1 ? `; ${pct(c.overlap)} overlap with your book (${c.shared.slice(0, 4).join(", ")})` : ""}.`
            : (fund.error ?? "Not read yet.")
        }
        value={f && staleFiling(fund, today) ? undefined : fit !== null ? pct(fit) : f ? "Not ranked" : undefined}
      />
    );
  };

  const creedCard = ({ id, match }: CreedRank, i: number) => {
    const c = creeds[id];
    return (
      <ListLinkRow
        key={id}
        href={`#fund-${id}` as Route}
        label={
          <span className="flex flex-wrap items-center gap-2">
            <span className="data text-caption text-text-tertiary">{i + 1}</span>
            <span className="font-semibold">{names.get(id) ?? id}</span>
          </span>
        }
        detail={match ? `${match.approach === null ? "Your classes test no figure its words can be laid on. " : ""}${matchWords(match, lens)}` : c?.error ? c.error : "Not read yet: what it says is read once a quarter, for everyone, from its own pages."}
        value={match && match.approach !== null ? pct(match.approach) : undefined}
      />
    );
  };

  const moves = (title: string, list: FundMove[], words: (x: FundMove) => string) =>
    list.length ? (
      <div>
        <p className="mb-1 text-footnote font-medium text-text-secondary">{title}</p>
        <ul className="space-y-0.5 text-footnote">
          {list.map((x) => (
            <li key={`${title}-${x.name}`}>
              {link(x.ticker, <span className="data">{shown(x.ticker, x.name)}</span>)} <span className="text-text-secondary">{words(x)}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <PageHeader title="Top funds" subtitle="What long-term managers own, by their 13Fs" fresh={<ScreenFreshness />} />
      <PageBody>
        {error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{error}</p> : null}
        {!ranked.length ? (
          <EmptyState icon={Building} title="No 13F read yet" instruction={ws.preferences.edgarContact ? `The ${FUNDS.length} funds' latest 13Fs are read from the SEC by the morning run and when you open the app.` : "Confirm the contact the SEC will see, on Setup under Company filings, and the funds' 13Fs are read from the SEC."} action={null} />
        ) : (
          <>
            <p className="mb-6 px-1 text-footnote text-text-secondary">
              {demo ? "Fictional funds, for the demo. " : ""}Every manager of more than $100 million files a 13F with the SEC within 45 days of each quarter&rsquo;s end: its US-listed long positions at that date, nothing short, nothing abroad, no cash. {result ? "Each fund is ranked by the share of its 13F, among the companies the app has figures for, that your classes would own, run on the screener's figures; it moves when the screener reads a company again or a fund files a new 13F." : "Ranked by overlap with your book; a methodology with classes ranks them by fit."} It says what they held, not what they hold now. Not investment advice.
            </p>
            {slots.includes("fund_ranking") ? (
              <ListSection grid header={result ? "Closest to your methodology" : "The funds"}>
                {ranked.map(card)}
              </ListSection>
            ) : null}
            {slots.includes("fund_creeds") ? (
              <ListSection grid header="Closest in what they say" footer={`${creedError ? `${creedError} ` : ""}How each says it invests and the theses it states, read once a quarter from its own letters, site and filings, set against the tests your classes set and your theses. The share is of your approach it says it shares, less what it says the other way: words, not what it owns. Each approach and its theses can be adopted on the Marketplace, under Methodology.`}>
                {byCreed.map(creedCard)}
              </ListSection>
            ) : null}
            {slots.includes("fund_moves")
              ? ranked.map(({ fund, closeness: c }, i) => {
                  const f = fund.latest;
                  if (!f) return null;
                  const fits = new Map((c?.fits ?? []).map((x) => [x.ticker, x.classId]));
                  return (
                    <details key={fund.id} id={`fund-${fund.id}`} open={i < OPEN} className="card mb-4 scroll-mt-20 px-4 py-4">
                      <summary className="cursor-pointer">
                        <span className="text-subhead font-semibold">{fund.name}</span>
                        <span className="ml-2 text-footnote text-text-secondary">
                          Quarter to {longDate(f.period)}, filed {longDate(f.filed)} · {f.count} positions, {money(f.total)}
                        </span>
                      </summary>
                      {c?.byClass.length ? (
                        <p className="mt-3 flex flex-wrap gap-2 text-footnote">
                          {c.byClass.map((b) => (
                            <StatusPill key={b.id} tone="info">
                              {b.label} {pct(b.pct)}
                            </StatusPill>
                          ))}
                        </p>
                      ) : null}
                      {slots.includes("fund_creeds") && creeds[fund.id] && !creeds[fund.id].error ? <CreedView creed={creeds[fund.id]} lens={lens} link={link} shown={shown} /> : null}
                      {fund.moves ? (
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {moves("Bought", fund.moves.bought, (x) => `new, ${pct(x.pct)}`)}
                          {moves("Added to", fund.moves.added, (x) => `${pct(x.before)} to ${pct(x.pct)}`)}
                          {moves("Trimmed", fund.moves.trimmed, (x) => `${pct(x.before)} to ${pct(x.pct)}`)}
                          {moves("Sold", fund.moves.sold, (x) => `was ${pct(x.before)}`)}
                        </div>
                      ) : (
                        <p className="mt-3 text-footnote text-text-secondary">The quarter before could not be read, so no moves.</p>
                      )}
                      <p className="mb-1 mt-4 text-footnote font-medium text-text-secondary">Largest positions</p>
                      <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-footnote sm:grid-cols-2 lg:grid-cols-3">
                        {f.positions.slice(0, 12).map((p) => (
                          <li key={p.cusip} className="flex items-baseline justify-between gap-3">
                            <span className="truncate">
                              {link(p.ticker, <span className="data">{shown(p.ticker, p.name)}</span>)}
                              {fits.has(p.ticker ?? "") ? <span className="ml-2 text-caption text-accent-text">{labels.get(fits.get(p.ticker!)!) ?? ""}</span> : null}
                              {p.ticker && held.has(p.ticker) ? <span className="ml-2 text-caption text-text-tertiary">held</span> : null}
                            </span>
                            <span className="data shrink-0">{pct(p.pct)}</span>
                          </li>
                        ))}
                      </ul>
                      {fund.error ? <p className="mt-3 text-caption text-text-tertiary">{fund.error}</p> : null}
                      {!demo ? (
                        <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${fund.cik}&type=13F-HR`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-footnote text-accent-text">
                          Its 13Fs at the SEC
                        </a>
                      ) : null}
                    </details>
                  );
                })
              : null}
            {!result && m ? <ListSection><ListRow wrap label="Your methodology sorts no classes, so no fund is ranked by fit." /></ListSection> : null}
          </>
        )}
      </PageBody>
    </>
  );
}

/** What a fund says it does: its approach, its styles (yours marked), the figures it looks for against your classes' tests, its theses and the pages. */
function CreedView({ creed: c, lens, link, shown }: { creed: FundCreed; lens: Lens; link: (ticker: string | null, inner: React.ReactNode) => React.ReactNode; shown: (ticker: string | null, name: string) => string }) {
  const styles = [...creedStyles(c)];
  return (
    <div className="mt-4 rounded-[12px] border border-hairline bg-surface-2 px-3 py-3">
      <p className="text-footnote font-medium text-text-secondary">What it says it does</p>
      <p className="mt-1 text-subhead leading-relaxed">{c.summary}</p>
      {styles.length ? (
        <p className="mt-2 flex flex-wrap gap-2 text-footnote">
          {styles.map((st) => (
            <StatusPill key={st} tone={lens.styles.has(st) ? "info" : "neutral"}>
              {styleLabel(st)}
              {lens.styles.has(st) ? ", like yours" : ""}
            </StatusPill>
          ))}
        </p>
      ) : null}
      {c.tests.length ? (
        <ul className="mt-3 space-y-0.5 text-footnote">
          {c.tests.map((t) => {
            const mine = lens.tests.get(t.group);
            return (
              <li key={t.group}>
                <span className="font-medium">{groupLabel(t.group)}, {t.want}</span> <span className="text-text-secondary">{t.words}</span>
                {mine ? <span className={mine === t.want ? "ml-2 text-caption text-accent-text" : "ml-2 text-caption text-warn"}>{mine === t.want ? "your classes too" : `your classes want it ${mine}`}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {c.theses.length ? (
        <>
          <p className="mb-1 mt-3 text-footnote font-medium text-text-secondary">Its theses</p>
          <ul className="space-y-1.5 text-footnote">
            {c.theses.map((t, i) => (
              <li key={`${t.title}-${i}`}>
                {t.ticker ? link(t.ticker, <span className="data">{shown(t.ticker, t.ticker)}</span>) : <span className="text-text-secondary">{t.theme ? themeLabel(t.theme) : ""}</span>} <span className="font-medium">{t.title}.</span> <span className="text-text-secondary">{t.words}</span>{" "}
                {(t.ticker && lens.tickers.has(t.ticker)) || (t.theme && lens.themes.has(t.theme)) ? <span className="text-caption text-accent-text">you have one too </span> : null}
                <a href={t.source.url} target="_blank" rel="noreferrer noopener" className="text-caption text-accent-text">
                  {t.source.title}
                  {t.source.date ? `, ${longDate(t.source.date)}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-3 text-caption text-text-tertiary">
        Read {longDate(c.readAt.slice(0, 10))} from {c.sources.length ? c.sources.map((x, i) => (
          <span key={x.url}>
            {i ? ", " : ""}
            <a href={x.url} target="_blank" rel="noreferrer noopener" className="text-accent-text">
              {x.title}
            </a>
          </span>
        )) : "its own pages"}
        . {c.note ? `${c.note} ` : ""}In the app&rsquo;s words, not the manager&rsquo;s; not investment advice.
      </p>
    </div>
  );
}
