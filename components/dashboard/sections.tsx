import { ChevronRight } from "lucide-react";
import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";

import { NAV } from "@/components/app/nav-items";
import { ShareBar } from "@/components/app/share-bar";
import { Columns } from "@/components/charts/columns";
import { Donut } from "@/components/charts/donut";
import { FigureView } from "@/components/dashboard/figure";
import { FreshBadge } from "@/components/ui/freshness";
import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import type { Fresh } from "@/lib/freshness";
import { ASSET_CLASS_LABEL, ASSET_GROUPS, assetClassColor } from "@/lib/asset-classes";
import { commitments, fixedIncome, fundLookThrough, netWorth, overlap, ownerValue, themeExposure } from "@/lib/exposure";
import { money, type AssetClass, type Book, type Holding } from "@/lib/holdings";
import type { MarketRow } from "@/lib/markets";
import type { Section } from "@/lib/methodology";
import { ownerValueOf, PANELS, type EvalCtx, type PanelId } from "@/lib/ontology";
import { optionAlerts, optionViews, portfolioGreeks } from "@/lib/options";
import type { PropertyWatch } from "@/lib/property-watch";
import type { Signal } from "@/lib/screens";
import { computeExpr, type Figure } from "@/lib/recipes";
import type { InputId } from "@/lib/setup";
import { cn } from "@/lib/utils";

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

type Ctx = { book: Book; today: string; themes: string[]; watch: PropertyWatch | null; classOf?: (h: Holding) => string | null; classLabel?: (id: string) => string };

// Archetype, benchmark and accent hues only; status colours are never series.
const HOLDING_PALETTE = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)", "var(--series-spy)", "var(--series-qqq)", "var(--viz-text)", "var(--text-tertiary)"];

/** Every holding by weight of the owner's value, largest first; the class the methodology gives each in the table. */
function Holdings({ book, view, classOf, classLabel }: { book: Book; view: "chart" | "table"; classOf?: (h: Holding) => string | null; classLabel?: (id: string) => string }) {
  const ccy = book.fx.base;
  // One slice per symbol: the same share held at two brokers is one holding to its owner.
  const bySymbol = new Map<string, { h: Holding; value: number }>();
  for (const h of book.holdings) {
    const value = ownerValueOf(h, book);
    if (value <= 0) continue;
    const key = h.symbol.toUpperCase();
    const seen = bySymbol.get(key);
    if (!seen) bySymbol.set(key, { h, value });
    else bySymbol.set(key, { h: seen.value >= value ? seen.h : h, value: seen.value + value });
  }
  const rows = [...bySymbol.values()].sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const className = (h: Holding) => {
    const id = classOf?.(h) ?? null;
    return id ? (classLabel?.(id) ?? id) : "No class yet";
  };
  if (!rows.length) return <ListSection><ListRow label="No holdings with a value yet." /></ListSection>;
  if (view === "table") {
    return (
      <ListSection grid footer={`Share of ${money(total, ccy)} across ${rows.length} holding${rows.length === 1 ? "" : "s"}.`}>
        {rows.map(({ h, value }) => (
          <ListRow key={h.symbol.toUpperCase()} label={<><span className="data mr-2">{h.symbol}</span>{h.name !== h.symbol ? <span className="text-text-secondary">{h.name}</span> : null}</>} detail={`${className(h)} · ${money(value, ccy)}`} value={<span className="data">{pc(value / total)}</span>} />
        ))}
      </ListSection>
    );
  }
  const top = rows.slice(0, 12);
  const rest = rows.slice(12);
  const slices = [
    ...top.map((r, i) => ({ key: r.h.symbol.toUpperCase(), label: r.h.symbol, value: (r.value / total) * 100, color: HOLDING_PALETTE[i % HOLDING_PALETTE.length], group: className(r.h), detail: money(r.value, ccy) })),
    ...(rest.length ? [{ key: "rest", label: `${rest.length} more`, value: (rest.reduce((s, r) => s + r.value, 0) / total) * 100, color: "var(--arch-none)", group: "", detail: money(rest.reduce((s, r) => s + r.value, 0), ccy) }] : []),
  ];
  return (
    <Donut
      title="Every holding"
      subtitle={`Share of the owner's value, ${money(total, ccy)}. Real estate net of its mortgage.`}
      slices={slices}
      legend={slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))}
      centre={{ value: String(rows.length), label: rows.length === 1 ? "holding" : "holdings" }}
      tableCaption="Every holding by weight"
      tableHead={["Holding", "Weight", "Class", "Value"]}
    />
  );
}


function hrefFor(id: PanelId): Route {
  const mod = PANELS[id].module;
  return NAV.find((n) => n.module === mod)?.href ?? "/";
}

function Card({ label, href, children }: { label: string; href?: Route; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="section-header">{label}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center text-footnote text-accent-text">
            Open <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** How fresh a methodology figure is: an indicator's from the market feed, anything else from the book. */
export type FigureFresh = { book: Fresh | null; markets: Fresh | null };

/** A figure's freshness badge: the market feed's for an indicator, the book's for the rest. */
export function figureBadge(f: Figure, fresh?: FigureFresh): React.ReactNode {
  if (!fresh) return null;
  const e = f.expr;
  const overMarkets = e.op !== "series" && (e.op === "measure" || e.op === "scaled" ? [e.of] : e.op === "ratio" ? [e.num, e.den] : e.op === "growth" ? [e.now, e.before] : [e.a, e.b]).some((t) => t.over === "markets");
  const one = overMarkets ? fresh.markets : fresh.book;
  return one ? <FreshBadge compact fresh={one} /> : null;
}

/**
 * A group of the methodology's own figures, each drawn as its recipe asks,
 * each badged with how fresh it is. `omit` leaves out figures the screen
 * already shows (a headline tile, a view of its own), so nothing is said twice
 * on one page; a section left with nothing is not drawn.
 */
/**
 * Where each of `n` tiles sits so every row is full (Hamza, 19 Oct 2026: a
 * tile alone under a row of four looked uneven): four to a row from 1024px,
 * two below; the tiles of a short last row share it out between them.
 */
export function tileSpans(n: number): string[] {
  const lastLg = n % 4;
  const lastSm = n % 2;
  const LG: Record<number, string> = { 1: "lg:col-span-12", 2: "lg:col-span-6", 3: "lg:col-span-4" };
  return Array.from({ length: n }, (_, i) => cn(lastSm && i === n - 1 ? "col-span-2" : "col-span-1", lastLg && i >= n - lastLg ? LG[lastLg] : "lg:col-span-3"));
}

export function FiguresSection({ section, figures, ctx, inputs, omit = [], fresh, markets, signals, more = [] }: { section: Extract<Section, { kind: "figures" }>; figures: Figure[]; ctx: EvalCtx; inputs: readonly InputId[]; omit?: readonly string[]; fresh?: FigureFresh; /** The market rows, so a figure on one indicator draws its range (Markets). */ markets?: readonly MarketRow[] | null; /** The rules' signals, so a figure a rule tests takes its colour and limit. */ signals?: readonly Signal[]; /** Tiles the page adds after the methodology's own (Alpha on Performance). */ more?: readonly { key: string; tile: React.ReactNode }[] }) {
  const ccy = ctx.book.fx.base;
  const shown = section.figures.filter((id) => !omit.includes(id)).map((id) => figures.find((f) => f.id === id)).filter((f): f is Figure => !!f);
  if (!shown.length) return null;
  const tiles = shown.filter((f) => f.view === "tile");
  const rest = shown.filter((f) => f.view !== "tile");
  return (
    <Card label={section.label}>
      {tiles.length ? (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-12">
          {[
            ...tiles.map((f) => ({ key: f.id, tile: <FigureView figure={f} result={computeExpr(f.expr, f.unit, ctx, inputs, f.by)} ccy={ccy} badge={figureBadge(f, fresh)} markets={markets} signal={signals?.find((s) => s.rule.test?.figure === f.id) ?? null} /> })),
            ...more,
          ].map((t, i, all) => (
            <div key={t.key} className={cn("grid min-w-0 grid-cols-1", tileSpans(all.length)[i])}>
              {t.tile}
            </div>
          ))}
        </div>
      ) : null}
      {rest.map((f) => (
        <div key={f.id} className="mb-3">
          <FigureView figure={f} result={computeExpr(f.expr, f.unit, ctx, inputs, f.by)} ccy={ccy} badge={figureBadge(f, fresh)} />
        </div>
      ))}
    </Card>
  );
}

function Allocation({ book, view }: { book: Book; view: "chart" | "table" }) {
  const nw = netWorth(book);
  const ccy = book.fx.base;
  if (view === "chart") {
    return (
      <Donut
        title="By asset class"
        subtitle={`Real estate at the owner's share, net of mortgage. In ${ccy}.`}
        slices={nw.byAssetClass.map((s) => ({ key: s.key, label: ASSET_CLASS_LABEL[s.key as AssetClass] ?? s.key, value: s.share * 100, color: assetClassColor(s.key), group: s.key, detail: money(s.value, ccy) }))}
        legend={ASSET_GROUPS.map((g) => ({ ...g, kind: "rect" as const }))}
        centre={{ value: money(nw.total, ccy), label: "net worth" }}
        tableCaption="Net worth by asset class"
        tableHead={["Asset class", "Share", "Group", "Value"]}
      />
    );
  }
  return (
    <ListSection>
      {nw.byAssetClass.map((s) => (
        <ListRow key={s.key} label={ASSET_CLASS_LABEL[s.key as AssetClass] ?? s.key} leading={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: assetClassColor(s.key) }} aria-hidden />} detail={money(s.value, ccy)} value={pc(s.share)} />
      ))}
    </ListSection>
  );
}

function Themes({ book, view, tracked }: { book: Book; view: "chart" | "table"; tracked: string[] }) {
  const all = themeExposure(book);
  const isTracked = (t: string) => tracked.some((x) => t.toLowerCase().includes(x.toLowerCase()));
  // Themes the methodology names come first, then the largest of the rest.
  const rows = [...all.filter((t) => isTracked(t.theme)), ...all.filter((t) => !isTracked(t.theme))].slice(0, 6);
  const total = netWorth(book).total || 1;
  const scale = Math.max(...rows.map((t) => t.share), 0.01);
  return (
    <ListSection footer="Share of net worth, looking through funds; a holding with no theme tagged counts toward its sector (GICS-style, from the SEC industry code once filings are read). The lighter part of a bar is estimated.">
      {rows.map((t) => (
        <ListRow
          key={t.theme}
          label={
            <>
              {t.theme}
              {isTracked(t.theme) ? <span className="ml-2 text-caption text-accent-text">tracked</span> : null}
              {view === "chart" ? <ShareBar share={t.share} estimated={t.estimated / total} scale={scale} /> : null}
            </>
          }
          detail={view === "table" ? `${money(t.direct, book.fx.base)} direct · ${money(t.lookThrough, book.fx.base)} through funds` : undefined}
          value={pc(t.share)}
        />
      ))}
    </ListSection>
  );
}

function Overlap({ book }: { book: Book }) {
  const rows = overlap(book).slice(0, 5);
  return (
    <ListSection>
      {rows.length ? (
        rows.map((r) => <ListRow key={r.company} label={r.ticker ? `${r.company} (${r.ticker})` : r.company} detail={r.places.map((p) => p.via).join(" · ")} value={pc(r.share)} />)
      ) : (
        <ListRow label="No company appears in more than one place." />
      )}
    </ListSection>
  );
}

function Options({ book, today, view }: { book: Book; today: string; view: "chart" | "table" }) {
  const views = optionViews(book, today);
  if (!views.length) return <ListSection><ListRow label="No open options." /></ListSection>;
  const g = portfolioGreeks(views);
  const alerts = optionAlerts(views);
  const ccy = book.fx.base;
  return (
    <ListSection grid>
      <ListRow label="Delta" detail="Share-equivalent, all contracts" value={`${g.delta >= 0 ? "+" : ""}${g.delta.toFixed(0)} sh`} />
      <ListRow label="Theta" detail="Time decay per day" value={`${g.theta >= 0 ? "+" : ""}${money(g.theta, ccy)}`} />
      {alerts.slice(0, view === "table" ? 8 : 4).map((a) => (
        <ListRow key={`${a.holdingId}-${a.kind}`} wrap label={a.text} trailing={<StatusPill tone={a.kind === "short_itm" || a.kind === "expires_today" ? "danger" : "warn"}>{a.kind === "short_itm" ? "In the money" : "Expiry"}</StatusPill>} />
      ))}
      {view === "table"
        ? [...views]
            .sort((a, b) => a.dte - b.dte)
            .slice(0, 6)
            .map((v) => <ListRow key={v.holding.id} label={`${v.contracts > 0 ? "+" : ""}${v.contracts} ${v.option.underlying} ${v.option.strike}${v.option.right}`} detail={`${v.holding.account} · ${v.dte} days`} value={money(v.holding.value, v.holding.currency)} />)
        : null}
    </ListSection>
  );
}

function Income({ book, today, view }: { book: Book; today: string; view: "chart" | "table" }) {
  const fi = fixedIncome(book, today);
  const ccy = book.fx.base;
  if (!fi.total) return <ListSection><ListRow label="No bonds or deposits yet." /></ListSection>;
  return (
    <>
      {view === "chart" ? (
        <div className="mb-3">
          <Columns title="Maturity ladder" subtitle={`By year, in ${ccy}`} labels={fi.ladder.map((l) => l.key)} values={fi.ladder.map((l) => l.value)} color="var(--arch-cm)" format="money" tableCaption="Fixed income by maturity year" />
        </div>
      ) : null}
      <ListSection grid>
        {view === "table" ? fi.ladder.map((l) => <ListRow key={l.key} label={l.key} value={money(l.value, ccy)} />) : null}
        <ListRow label="Stated yield" detail={`${(fi.yieldCoverage * 100).toFixed(0)}% of fixed income states one`} value={fi.weightedYieldPct === null ? "n/a" : `${fi.weightedYieldPct.toFixed(2)}%`} />
        {fi.maturingSoon.map((m) => (
          <ListRow key={m.name} label={m.name} detail={`Matures ${m.maturity}`} value={money(m.value, ccy)} />
        ))}
      </ListSection>
    </>
  );
}

function Funds({ book, view }: { book: Book; view: "chart" | "table" }) {
  const c = commitments(book);
  const ccy = book.fx.base;
  const top = [...fundLookThrough(book)].sort((a, b) => b.value - a.value).slice(0, view === "table" ? 8 : 4);
  if (!c.funds.length) return <ListSection><ListRow label="No private funds yet." /></ListSection>;
  return (
    <ListSection grid>
      <ListRow label="Unfunded commitments" detail={`Cash and deposits ${money(c.cash + c.deposits, ccy)}`} value={money(c.totalUnfunded, ccy)} />
      <ListRow label="Calls covered by cash" value={c.coverage === null ? "n/a" : `${c.coverage.toFixed(2)}x`} />
      {top.map((r) => (
        <ListRow key={`${r.parentId}-${r.name}`} label={r.name} detail={`${r.parentName}${r.estimated ? " · estimated" : ""}`} value={money(r.value, ccy)} />
      ))}
    </ListSection>
  );
}

function Properties({ book, watch }: { book: Book; watch: PropertyWatch | null }) {
  const props = book.holdings.filter((h) => h.assetClass === "real_estate" && h.property);
  if (!props.length) return <ListSection><ListRow label="No properties yet." /></ListSection>;
  return (
    <ListSection grid>
      {props.map((h) => {
        const w = watch?.properties.find((x) => x.holdingId === h.id);
        const ltv = h.value ? (h.property!.mortgage / h.value) * 100 : 0;
        return <ListRow key={h.id} wrap label={h.name} detail={`Loan to value ${ltv.toFixed(0)}%${w?.whatChanged ? ` · This week: ${w.whatChanged}` : ""}`} value={money(ownerValue(h, book), book.fx.base)} />;
      })}
    </ListSection>
  );
}

const SOURCE_LABEL: Record<string, string> = { broker: "Broker marks", bank_statement: "Bank statements", fund_report: "Fund reports", manual: "Entered by hand", estimate: "Estimates" };

function Freshness({ book }: { book: Book }) {
  const by = new Map<string, { oldest: string; count: number }>();
  for (const h of book.holdings) {
    const row = by.get(h.valuation) ?? { oldest: h.asOf, count: 0 };
    row.count += 1;
    if (h.asOf < row.oldest) row.oldest = h.asOf;
    by.set(h.valuation, row);
  }
  return (
    <ListSection footer="A bank statement from last month, a fund report from last quarter and last night's broker mark are not the same kind of number.">
      {[...by.entries()].map(([k, v]) => (
        <ListRow key={k} label={SOURCE_LABEL[k] ?? k} detail={`${v.count} holdings`} value={`oldest ${v.oldest}`} />
      ))}
    </ListSection>
  );
}

export function DashboardSection({ id, view, ctx }: { id: PanelId; view: "chart" | "table"; ctx: Ctx }) {
  const body = (() => {
    switch (id) {
      case "holdings":
        return <Holdings book={ctx.book} view={view} classOf={ctx.classOf} classLabel={ctx.classLabel} />;
      case "allocation":
        return <Allocation book={ctx.book} view={view} />;
      case "themes":
        return <Themes book={ctx.book} view={view} tracked={ctx.themes} />;
      case "overlap":
        return <Overlap book={ctx.book} />;
      case "options":
        return <Options book={ctx.book} today={ctx.today} view={view} />;
      case "income":
        return <Income book={ctx.book} today={ctx.today} view={view} />;
      case "funds":
        return <Funds book={ctx.book} view={view} />;
      case "properties":
        return <Properties book={ctx.book} watch={ctx.watch} />;
      case "freshness":
        return <Freshness book={ctx.book} />;
    }
  })();
  return <Card label={PANELS[id].label} href={id !== "freshness" ? hrefFor(id) : undefined}>{body}</Card>;
}
