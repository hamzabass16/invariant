import { Filter } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { ScreenFreshness } from "@/components/app/screen-freshness";
import { HeatMap } from "@/components/markets/heat-map";
import { classColor } from "@/components/holdings/portfolio-donuts";
import { ClassBoard, CompanyTiles, type BoardTile } from "@/components/screener/class-board";
import { FilterPills, type Pill } from "@/components/screener/filter-pills";
import { ScreenTable } from "@/components/screener/screen-table";
import { AskInWords, WordScreenHead } from "@/components/screener/words-screens";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { companyHref } from "@/lib/company";
import { slotsOn } from "@/lib/screens";
import { loadMarketDay } from "@/lib/markets-feed";
import { screenOf, screenSentence, screenWith, type ScreenRow } from "@/lib/screener";
import { DEMO_WORD_SCREEN, screenClass } from "@/lib/screen-words";
import { applyFilters, chosenFilters, mapDay, screenFilters, sortOf, sortRows, TABLE_SHOWN, tableRows, type SortKey } from "@/lib/screener-table";
import { localDay, longDate } from "@/lib/time";
import { screen, screenerFor } from "@/lib/workspace";

export const metadata = { title: "Screener · Invariant" };

const capWords = (cap: number | null) => (cap === null ? null : cap >= 1e12 ? `$${(cap / 1e12).toFixed(1)}tn` : `$${Math.round(cap / 1e9)}bn`);

/**
 * The screener (lib/screener.ts, lib/screener-table.ts): every company in the
 * S&P 500 and the Nasdaq-100 as a table or a heat map with filter pills, after
 * TradingView's (Hamza, 23 Oct 2026), and the person's classes on them, after
 * Unusual Whales (21 Oct 2026): each class's companies the largest first, then
 * those one criterion short. A company held or watched is marked; each opens its
 * company page. The figures are the filings' own; the verdicts the
 * methodology's recipes.
 */
const VIEWS = [
  { id: "table", label: "Table" },
  { id: "map", label: "Heat map" },
  { id: "classes", label: "Your classes" },
] as const;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const { file, error } = await screenerFor(ws);
  const today = localDay();
  const own = Object.fromEntries(Object.values(ws.filings?.bySymbol ?? {}).filter((e) => !e.error).map((e) => [(e.ticker ?? e.symbol).toUpperCase(), { values: e.values, name: e.name }]));
  const held = new Set((ws.fullBook ?? ws.book)?.holdings.map((h) => h.symbol.toUpperCase()) ?? []);
  const watched = new Set(Object.keys(ws.records.bySymbol).map((s) => s.toUpperCase()).filter((s) => !held.has(s)));
  const slots = slotsOn("screener", ws.shown);
  const result = screenOf(ws.setup.methodology, file, own, held, watched, today);
  const tableOn = slots.includes("screen_table");
  const mapOn = slots.includes("screen_map");
  const classesOn = !!result && (slots.includes("screen_classes") || slots.includes("screen_near") || slots.includes("screen_words"));
  const views = VIEWS.filter((v) => (v.id === "table" ? tableOn : v.id === "map" ? mapOn : classesOn));
  const view = views.find((v) => v.id === one(sp.view)) ?? views[0];
  const session = view && view.id !== "classes" ? (await loadMarketDay()).day : null;
  const editable = ws.mode === "drive";
  const wordScreens = demo ? [DEMO_WORD_SCREEN] : ws.preferences.wordScreens;
  const asked = view?.id === "classes" && slots.includes("screen_words") ? wordScreens.map((w) => ({ w, ...screenWith(screenClass(w), file, own, held, watched, today) })) : [];

  // The address of this screen with some parameters changed; null drops one.
  const hrefWith = (change: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (one(v) && !(k in change)) q.set(k, one(v)!);
    for (const [k, v] of Object.entries(change)) if (v !== null) q.set(k, v);
    const s = q.toString();
    return `/screener${s ? `?${s}` : ""}`;
  };
  const all = tableRows(file, session, result?.placed ?? {}, own, held, watched);
  const filters = screenFilters(all, ws.setup.methodology?.classes ?? [], result?.classes ?? null);
  const chosen = chosenFilters(filters, sp);
  const matching = applyFilters(all, chosen);
  const sort = sortOf(sp);
  const sorted = sortRows(matching, sort.key, sort.dir);
  const showAll = one(sp.all) === "1";
  const pills: Pill[] = filters.map((f) => {
    const on = chosen.find((c) => c.filter.id === f.id)?.option ?? null;
    return { id: f.id, label: f.label, chosen: on?.label ?? null, clearHref: hrefWith({ [f.id]: null, all: null }), options: f.options.map((o) => ({ id: o.id, label: o.label, on: on?.id === o.id, href: hrefWith({ [f.id]: o.id, all: null }) })) };
  });
  const resetHref = chosen.length ? hrefWith(Object.fromEntries([...filters.map((f) => [f.id, null] as const), ["all", null] as const])) : null;
  const sortHref = (key: SortKey) => hrefWith({ sort: key, dir: sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : key === "symbol" || key === "sector" ? "asc" : "desc" });
  const classLabel = (id: string) => ws.setup.methodology?.classes.find((c) => c.id === id)?.label ?? id;
  const fundamentalOn = chosen.some((c) => c.filter.fundamental);

  const m = ws.setup.methodology;
  const tile = (r: ScreenRow, near = false): BoardTile => {
    const hidden = demo && !held.has(r.symbol);
    const cls = m?.classes.find((c) => c.id === r.classId);
    return {
      key: r.symbol,
      symbol: hidden ? null : r.symbol,
      name: r.name,
      sub: [r.sector, capWords(r.cap)].filter(Boolean).join(" · ") || null,
      href: hidden ? null : companyHref(r.symbol),
      badge: r.held ? "Held" : r.watched ? "Watched" : null,
      passes: r.passes,
      of: r.of,
      needed: r.needed,
      short: near ? { label: cls?.label ?? r.classId, color: classColor(m, r.classId), first: r.short[0] ?? "", more: Math.max(0, r.short.length - 1) } : undefined,
    };
  };

  return (
    <>
      <PageHeader title="Screener" subtitle="The S&P 500 and the Nasdaq-100, with your classes" fresh={<ScreenFreshness />} />
      <PageBody>
        {error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{error}</p> : null}
        {views.length > 1 ? (
          <nav aria-label="Views" className="mb-4 inline-flex rounded-full border border-hairline bg-surface p-0.5">
            {views.map((v) => (
              <Link key={v.id} href={hrefWith({ view: v.id === views[0].id ? null : v.id, all: null }) as Route} scroll={false} aria-current={v.id === view?.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-footnote font-medium ${v.id === view?.id ? "bg-accent text-white" : "text-text-secondary hover:text-text"}`}>
                {v.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {view && view.id !== "classes" ? (
          <>
            <FilterPills pills={pills} resetHref={resetHref} />
            <p className="mb-4 px-1 text-footnote text-text-secondary">
              <span className="data text-text">{matching.length}</span> of {all.length} companies
              {session ? `, priced at the close of ${longDate(session.session)}` : ", with no session read yet for prices and moves"}. {demo ? "A sample: the demo's fictional session and figures. " : `Figures from the filings: ${screenSentence(file).replace(/^All /, "all ").replace(/^Not read yet: /, "none yet; ")} `}
              {fundamentalOn ? "A company not read yet has no figure, so a filter on one leaves it out." : view.id === "table" ? "A dash is a figure not read yet, never a zero." : ""}
            </p>
            {view.id === "table" ? (
              matching.length ? (
                <>
                  <ScreenTable rows={showAll ? sorted : sorted.slice(0, TABLE_SHOWN)} sort={sort} sortHref={sortHref} classLabel={classLabel} linkable={(r) => !demo || r.held} />
                  {sorted.length > TABLE_SHOWN && !showAll ? (
                    <p className="mt-3 px-1">
                      <Link href={hrefWith({ all: "1" }) as Route} scroll={false} className="text-footnote text-accent-text">
                        Show all {sorted.length}
                      </Link>
                    </p>
                  ) : null}
                </>
              ) : (
                <EmptyState icon={Filter} title="No company matches" instruction="Loosen a filter, or clear them all." action={resetHref ? <Link href={resetHref as Route} className="text-accent-text">Clear all</Link> : null} />
              )
            ) : session ? (
              matching.some((r) => r.changePct !== null) ? (
                <HeatMap day={mapDay(session, matching)} held={[...held]} title="Heat map of the screen" subject="companies on the screen" />
              ) : (
                <EmptyState icon={Filter} title="No company matches" instruction="Loosen a filter, or clear them all." action={resetHref ? <Link href={resetHref as Route} className="text-accent-text">Clear all</Link> : null} />
              )
            ) : (
              <EmptyState icon={Filter} title="No session read yet" instruction="The heat map draws the last closed session's moves; it is read after each US close." action={null} />
            )}
          </>
        ) : null}
        {view?.id === "classes" && result ? (
          !result.read ? (
            <EmptyState icon={Filter} title="Nothing read yet" instruction={ws.preferences.edgarContact ? screenSentence(file) : "Confirm the contact the SEC will see, on Setup under Company filings, and the screener reads the S&P 500 and the Nasdaq-100 a share at a time each morning."} action={null} />
          ) : (
            <>
              <p className="mb-6 px-1 text-footnote text-text-secondary">
                {demo ? "A sample: the session's companies with fictional figures, beside the snapshot's holdings, sorted by its methodology's classes. " : `${screenSentence(file)} `}
                Each company is in the first of your classes whose test holds, as on Holdings; the dots are the criteria that held, ringed up to the number the class needs.
                {result.oldest && !demo ? ` Figures from the filings, at the close of the day each was read (the oldest ${longDate(result.oldest)}).` : ""}
                {result.standIn ? ` For ${result.standIn} ${result.standIn === 1 ? "company" : "companies"} whose segment note is not read yet, company revenue growth stands in for the engine, as it does for a holding whose filing has no segment line; each note is read with the company's weekly refresh.` : ""}
              </p>
              <ClassBoard
                classes={slots.includes("screen_classes") ? result.classes.map((c) => ({ id: c.id, label: c.label, words: c.words, color: classColor(m, c.id), tiles: c.rows.map((r) => tile(r)) })) : []}
                near={slots.includes("screen_near") ? result.near.map((r) => tile(r, true)) : []}
                read={result.read}
              />
              {slots.includes("screen_words") ? (
                <>
                  <AskInWords editable={editable} hasModel={ws.hasModelKey} count={wordScreens.length} />
                  {asked.map(({ w, rows, total }) => (
                    <div key={w.id}>
                      <WordScreenHead s={w} total={total} editable={editable} />
                      <div className="mb-6">
                        <CompanyTiles tiles={rows.map((r) => tile(r))} color="var(--accent-text)" empty="No company on file passes every filter." />
                        <p className="mt-2 px-1 text-caption text-text-tertiary">{total > rows.length ? `The largest ${rows.length} of ${total}. ` : ""}The filters are the app&apos;s own reading of your words; the figures are the filings&apos;.</p>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              {result.unread.length ? (
                <p className="mb-6 px-1 text-footnote text-text-secondary">
                  The screener reads no figure for {result.unread.map((u) => u.label.toLowerCase()).join(", ")}, so a criterion on {result.unread.length === 1 ? "it" : "them"} does not hold here; a company you hold or watch is read in full.
                </p>
              ) : null}
            </>
          )
        ) : null}
        {!views.length ? <EmptyState icon={Filter} title="Your methodology sorts no classes" instruction="The screener runs your classes on every large US company. A methodology that sorts holdings into classes, on Setup, turns it on." action={<Link href="/setup" className="text-accent-text">Open Setup</Link>} /> : null}
        <p className="px-1 text-caption text-text-tertiary">Your rules applied to public filings. Not investment advice.</p>
      </PageBody>
    </>
  );
}
