"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import type { z } from "zod";

import { StatTile } from "@/components/app/figures";
import { DayTile } from "@/components/live/day-tile";
import { figureText } from "@/components/dashboard/figure";
import { RangeBar } from "@/components/dashboard/range-bar";
import { PortfolioGrid, type PortfolioGridProps } from "@/components/dashboard/portfolio-grid";
import { tileSpans } from "@/components/dashboard/sections";
import { BookDayCard, IndexDriversCard } from "@/components/markets/drivers";
import { HeatMap } from "@/components/markets/heat-map";
import { IndexCards, Movers } from "@/components/markets/session";
import { FreshBadge } from "@/components/ui/freshness";
import { ListRow, ListSection } from "@/components/ui/list";
import { ReturnChart } from "@/components/dashboard/return-chart";
import type { ReturnChartData } from "@/lib/return-chart";
import { asClosed, closedOn, FRESH, type Fresh } from "@/lib/freshness";
import { cn } from "@/lib/utils";
import { money } from "@/lib/holdings";
import type { Book } from "@/lib/holdings";
import { isTradingHours, lastSession, liveAnswerSchema, liveBook, liveSessionAnswerSchema, LIVE_CLOSED_POLL_SECONDS, LIVE_POLL_SECONDS, LIVE_SESSION_POLL_SECONDS, repriceHoldings, yearStrip, type LiveBook, type LiveQuote, type LiveSubject, type YearBase, type YearStrip } from "@/lib/live";
import { indexDrivers, signedPct, type BookDay, type MarketDay } from "@/lib/market-day";
import { computeFigure, contextFor, type Methodology } from "@/lib/methodology";
import type { Figure } from "@/lib/recipes";
import { movedTo } from "@/lib/figure-range";
import type { RangeSpec } from "@/lib/markets";
import type { InputId } from "@/lib/setup";

type Poll<T> = { answer: T | null; at: Date | null; problem: string | null; failedAt: Date | null };

const clock = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Asks a live route every `seconds` while the US market is open and the page
 * is in view, and while it is shut once on opening the page, once more right
 * after the bell for the final prints, then every `LIVE_CLOSED_POLL_SECONDS`:
 * the answer is then the last session's closes, which stay on screen instead
 * of the statement (Hamza, 17 Oct 2026). Nothing in a tab in the background,
 * or when `enabled` is false (the demo has no live prices). The last good
 * answer stays on screen when a read fails, with the time it was read.
 */
export function usePoll<S extends z.ZodTypeAny>(url: string, body: string, schema: S, seconds: number, enabled: boolean): Poll<z.infer<S>> {
  const [state, setState] = React.useState<Poll<z.infer<S>>>({ answer: null, at: null, problem: null, failedAt: null });
  React.useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running: AbortController | null = null;
    // The last read: when, and whether the market was open then.
    let last: { at: number; open: boolean } | null = null;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!isTradingHours(new Date()) && last && !last.open && Date.now() - last.at < LIVE_CLOSED_POLL_SECONDS * 1000) return;
      running?.abort();
      running = new AbortController();
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: running.signal, cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 401 ? "Sign in again to see prices now." : `Prices now could not be read (${res.status}).`);
        const answer = schema.parse(await res.json()) as z.infer<S> & { open: boolean };
        if (stopped) return;
        last = { at: Date.now(), open: answer.open };
        setState({ answer, at: new Date(), problem: null, failedAt: null });
      } catch (e) {
        if (stopped || (e instanceof Error && e.name === "AbortError")) return;
        const problem = e instanceof Error && (e.message.startsWith("Sign in") || e.message.startsWith("Prices now")) ? e.message : "Prices now could not be read.";
        setState((s) => ({ ...s, problem, failedAt: new Date() }));
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      running?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, body, schema, seconds, enabled]);
  return state;
}

const NO_EXTRA: readonly string[] = [];

/** Whether the US market is open now, checked again every minute, so a card's badge turns over at the bell without a reload. */
export function useMarketOpen(): boolean {
  const [open, setOpen] = React.useState(() => isTradingHours(new Date()));
  React.useEffect(() => {
    const tick = () => setOpen(isTradingHours(new Date()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return open;
}

/**
 * The badge on a live card when it is not live: during the session, until
 * prices come back, the close it still shows; outside the session, still
 * "Live", with "Markets have closed" and the date beside it, so the card
 * never reads as having changed its source at the bell (Hamza, 15 and 16 Oct
 * 2026: the freshness of a live card never changes; shut, it says why). The
 * date is the session's when the card holds the last session's prices
 * (`session`), else the figures' own (Hamza, 17 Oct 2026). The demo (`live`
 * false) keeps its own badge.
 */
export function restingFresh(fresh: Fresh | null, live: boolean, open: boolean, session: string | null = null): Fresh | null {
  if (!live || open) return fresh;
  if (session) return closedOn(session);
  return fresh ? asClosed(fresh) : null;
}

/** The book at today's prices; `extra` symbols (SPY, QQQ for the year strip) ride on the same request and come back in `quotes`. */
export function useLiveBook(subjects: readonly LiveSubject[], netWorth: number, enabled: boolean, extra: readonly string[] = NO_EXTRA): { book: LiveBook | null; quotes: readonly LiveQuote[]; at: Date | null; failedAt: Date | null; problem: string | null } {
  const body = React.useMemo(() => JSON.stringify({ symbols: [...new Set([...subjects.map((s) => s.symbol), ...extra])] }), [subjects, extra]);
  const s = usePoll("/api/live", body, liveAnswerSchema, LIVE_POLL_SECONDS, enabled && subjects.length + extra.length > 0);
  const book = s.answer && s.at ? liveBook(subjects, netWorth, s.answer.quotes, s.at) : null;
  return { book, quotes: s.answer?.quotes ?? [], at: s.at, failedAt: s.failedAt, problem: s.problem };
}

const YEAR_SYMBOLS: readonly string[] = ["SPY", "QQQ"];

/** "Live" in green with a spreading ring, and when the prices were read on the person's own clock. */
export function LiveBadge({ at, failedAt, every = LIVE_POLL_SECONDS }: { at: Date | null; failedAt: Date | null; every?: number }) {
  const fresh: Fresh = { kind: "live", label: FRESH.live.label, when: null, rhythm: `Prices every ${every} seconds while the US market is open.${failedAt ? " The last read failed; the prices shown are the ones before it." : ""}`, stale: false };
  return <FreshBadge compact fresh={fresh} detail={at ? (failedAt ? `as of ${clock(at)}` : clock(at)) : null} />;
}

const leftLine = (b: LiveBook, open: boolean) => (b.left.length ? `Not priced ${open ? "now" : "for the session"}, held as the book has them: ${b.left.map((l) => `${l.symbol} (${l.why})`).join(", ")}.` : null);

const FEED_NOTE = "Prices from Yahoo Finance, refreshed every 30 seconds while the US market is open; some listings lag the exchange by up to 15 minutes. Each holding moves from the book's own price; cash, funds, bonds and options stay as the book has them, and nothing is kept.";

const signedMoney = (v: number, ccy: string) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${money(Math.abs(v), ccy)}`;

/**
 * One of the methodology's headline figures as the page computed it at the
 * close: the tile's words, whether it reads a market indicator (badged with
 * the feed's freshness) and whether a price moves it (`prices`: live while
 * the US market is open, recomputed on the page from `LiveFigures`).
 */
/** A headline tile as computed at the close; `range` places the reading on its scale (lib/figure-range.ts) and `limit` is the rule's, for the tick. */
export type HeadlineTile = { id: string; label: string; text: string; detail: string | null; markets: boolean; prices: boolean; figure: Figure; range: RangeSpec | null; limit: number | null };

/**
 * What the page hands the browser so the headline figures a price moves can
 * be computed there at today's prices: the person's own book (its value
 * series left out), their methodology, the figures to compute and the
 * inputs. The same pure functions as the server's (lib/methodology.ts
 * contextFor, computeFigure) run on the book repriced with the public
 * quotes already read for the tiles; nothing leaves the page and nothing is
 * kept (Hamza, 16 Oct 2026: everything that can be live is live).
 */
export type LiveFigures = { book: Book; methodology: Methodology | null; figures: Figure[]; inputs: InputId[]; today: string };

/**
 * The Dashboard's tile grid: net worth, the day spanning at least two columns
 * (Hamza, 19 Oct 2026: "make it pop out more, fill the space"), then the
 * headline tiles. The column count is the one that fills its rows, and the
 * day widens to close a short first row, so no row is left with a gap. Phone:
 * net worth and the day each take the row.
 */
const LG_COLS = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" } as const;
const LG_SPAN = { 2: "col-span-2 lg:col-span-2", 3: "col-span-2 lg:col-span-3", 4: "col-span-2 lg:col-span-4" } as const;
export function tileGrid(headlines: number): { cols: string; daySpan: string } {
  const slots = 3 + headlines;
  const options = ([4, 3, 5] as const).map((c) => ({ c, extra: (c - (slots % c)) % c })).filter((o) => 2 + o.extra <= o.c - 1);
  const pick = slots <= 3 ? { c: 3 as const, extra: 0 } : options.find((o) => o.extra === 0) ?? options.sort((a, b) => a.extra - b.extra)[0] ?? { c: 4 as const, extra: 0 };
  return { cols: LG_COLS[pick.c], daySpan: LG_SPAN[(2 + pick.extra) as 2 | 3 | 4] };
}

/** The session's cards on the Dashboard and what sits among them: the book's day under the indices (Hamza, 16 Oct 2026); After the close and What happened moved to At the Close (Hamza, 18 Oct 2026). */
export type SessionProps = {
  close: MarketDay | null;
  held: string[];
  show: { indices: boolean; drivers: boolean; heatmap: boolean; movers: boolean };
  /** The line under the header: the last close, the breadth, and that the read is still running when it is. */
  intro: string;
};

const SESSION_BODY = "{}";

/**
 * The top of the Dashboard (Hamza, 15 and 16 Oct 2026): this year against
 * SPY and QQQ, net worth and the session, the methodology's headline tiles,
 * the return chart, then the session: how the indices closed, the book
 * holding by holding right under them, what drove the S&P 500 and QQQ, the
 * heat map and the movers (After the close and What happened are on
 * At the Close since 18 Oct 2026). While the US
 * market is open everything a price moves is live and says so, from two
 * reads on the page (the book's prices, on which the headline figures are
 * recomputed in the browser, and the session's five hundred companies);
 * after the bell the same reads hold the session's closes, and each card
 * keeps its Live badge with "Markets have closed" and the session's date
 * beside it (Hamza, 17 Oct 2026). The demo (`live` false) shows the close.
 */
export function BookNow({ subjects, netWorth, ccy, cashPct, close, bookFresh, closeFresh, waiting, live, headline, worthRange, headlineFresh, liveFigures: lf, year, yearFresh, chart, session, dayOn, beforeChart, grid }: {
  subjects: LiveSubject[];
  netWorth: number;
  ccy: string;
  cashPct: number;
  /** The book in the last closed session, from the session's read or the holdings' own closes; null until either arrives. */
  close: BookDay | null;
  bookFresh: Fresh | null;
  closeFresh: Fresh | null;
  /** Why the last session is not shown yet. */
  waiting: string;
  live: boolean;
  headline: HeadlineTile[];
  /** Net worth on its low to high over the last year, from the value series; null without one. */
  worthRange?: RangeSpec | null;
  headlineFresh: { book: Fresh | null; markets: Fresh | null };
  /** The book, methodology and figures to recompute at today's prices; null when no headline figure reads a price or the page is not live. */
  liveFigures?: LiveFigures | null;
  year?: { book: YearBase | null; SPY: YearBase | null; QQQ: YearBase | null } | null;
  yearFresh?: Fresh | null;
  /** The return or value chart against SPY and QQQ, drawn under the tiles with the same live read (Hamza, 15 Oct 2026). */
  chart?: ReturnChartData | null;
  /** The session's cards; null when the methodology asks for none of them. */
  session: SessionProps | null;
  /** Whether the book's day is drawn (the book_day or live_book slot). */
  dayOn: boolean;
  /** Drawn between the headline tiles and the chart: a dividend methodology's dividend tiles (Hamza, 19 Oct 2026). */
  beforeChart?: React.ReactNode;
  /** The portfolio as one ruled grid at the top (components/dashboard/portfolio-grid.tsx), in place of the net worth and day tiles; null when the slot is off or nothing is listed. */
  grid?: PortfolioGridProps | null;
}) {
  const s = useLiveBook(subjects, netWorth, live, year ? YEAR_SYMBOLS : NO_EXTRA);
  const book = s.book;
  const open = useMarketOpen();
  const dayFresh = restingFresh(closeFresh ?? bookFresh, live, open);
  const bookRest = restingFresh(bookFresh, live, open);
  // The session the read's prices are from: today while the market is open, else the last session, whose closes the read holds.
  const readSession = s.at ? lastSession(s.at) : null;
  // The badge on a card drawn from the read: Live with the time while the market is open; shut, Live with "Markets have closed" and the session's date.
  const readBadge = open ? <LiveBadge at={s.at} failedAt={s.failedAt} /> : <FreshBadge compact fresh={closedOn(readSession ?? lastSession(new Date()))} />;
  const strip = React.useMemo(() => (year ? yearStrip(year, s.at ? { bookRatio: book && netWorth > 0 ? book.netWorth / netWorth : null, quotes: s.quotes } : null, s.at ?? new Date()) : null), [year, s.at, s.quotes, book, netWorth]);
  const { cols, daySpan } = tileGrid(headline.length);

  // The headline figures at today's prices: the book repriced with the quotes already read, the same recipes run again here, only for the figures a price moves.
  const liveFigures = React.useMemo(() => {
    const out = new Map<string, { text: string; detail: string | null; value: number }>();
    if (!lf || !s.at || !s.quotes.length) return out;
    const { holdings, priced } = repriceHoldings(lf.book.holdings, s.quotes, s.at);
    if (!priced) return out;
    const ctx = contextFor({ ...lf.book, holdings }, lf.today, lf.methodology);
    for (const fig of lf.figures) {
      const r = computeFigure(fig, ctx, lf.inputs);
      if (r.kind !== "scalar" || r.needs.length || r.value === null) continue;
      out.set(fig.id, { text: figureText(fig, r.value, lf.book.fx.base), detail: fig.about ?? null, value: r.value });
    }
    return out;
  }, [lf, s.at, s.quotes]);

  // The session so far, every minute while the market is open; after the bell its closes until the kept read of the session lands, then the kept close.
  const ss = usePoll("/api/live/session", SESSION_BODY, liveSessionAnswerSchema, LIVE_SESSION_POLL_SECONDS, live && !!session);
  const now = ss.answer?.day ?? null;
  const day = now ?? session?.close ?? null;
  const sessionLive = !!now && open;
  const showDrivers = session?.show.drivers ?? false;
  const drivers = React.useMemo(() => (day && showDrivers ? indexDrivers(day) : []), [day, showDrivers]);
  const sessionBadge = now ? (open ? <LiveBadge at={ss.at} failedAt={ss.failedAt} every={LIVE_SESSION_POLL_SECONDS} /> : <FreshBadge compact fresh={closedOn(now.session)} />) : dayFresh ? <FreshBadge compact fresh={dayFresh} /> : null;

  const bookCard = book && book.rows.length ? (
    <BookDayCard day={book} ccy={ccy} label={open ? "Your book so far today" : `Your book in the session of ${book.session}`} badge={readBadge} unpricedNote={leftLine(book, open)} note={`Weights are of net worth at the close before${open ? ", moves are today's so far" : ""}. ${FEED_NOTE}`} />
  ) : close && close.rows.length ? (
    <BookDayCard day={close} ccy={ccy} badge={dayFresh ? <FreshBadge compact fresh={dayFresh} /> : null} />
  ) : null;

  return (
    <div data-live={book ? "today" : "close"}>
      {strip ? <YearStripCard strip={strip} open={open} badge={strip.cells.some((c) => c.live) ? readBadge : restingFresh(yearFresh ?? null, live, open) ? <FreshBadge compact fresh={restingFresh(yearFresh ?? null, live, open)!} /> : null} /> : null}
      {grid ? <PortfolioGrid {...grid} quotes={s.quotes} at={s.at} open={open} badge={book ? readBadge : bookRest ? <FreshBadge compact fresh={bookRest} /> : null} /> : null}
      {grid && !headline.length ? null : (
      <div className={grid ? "mb-6 grid grid-cols-2 gap-3 lg:grid-cols-12" : `mb-6 grid grid-cols-2 gap-3 ${cols}`}>
        {grid ? null : book ? (
          <>
            <StatTile center className="col-span-2 lg:col-span-1" label={open ? "Net worth now" : "Net worth"} value={money(book.netWorth, ccy)} extra={worthRange ? <RangeBar range={movedTo(worthRange, book.netWorth)} format={(v) => money(v, ccy)} /> : undefined} detail={`${signedMoney(book.sinceBook, ccy)} on the statement`} badge={readBadge} />
            <DayTile className={daySpan} label={open ? "Today so far" : `Session of ${dayWords(book.session)}`} pct={book.changePct} change={book.change} ccy={ccy} rows={book.rows} badge={readBadge} />
          </>
        ) : (
          <>
            <StatTile className="col-span-2 lg:col-span-1" label="Net worth" value={money(netWorth, ccy)} extra={worthRange ? <RangeBar range={worthRange} format={(v) => money(v, ccy)} /> : undefined} detail={`${cashPct.toFixed(1)}% in cash`} badge={bookRest ? <FreshBadge compact fresh={bookRest} /> : null} />
            {close ? (
              <DayTile className={daySpan} label={`Session of ${dayWords(close.session)}`} pct={close.changePct} change={close.change} ccy={ccy} rows={close.rows} badge={dayFresh ? <FreshBadge compact fresh={dayFresh} /> : null} />
            ) : (
              <StatTile className={daySpan} label="Last session" value="–" detail={waiting} badge={dayFresh ? <FreshBadge compact fresh={dayFresh} /> : null} />
            )}
          </>
        )}
        {headline.map((h, i) => {
          const now = liveFigures.get(h.id);
          const bar = (range: RangeSpec | null) => (range ? <RangeBar range={range} format={(v) => figureText(h.figure, v, ccy)} limit={h.limit} /> : undefined);
          // Beside the grid the tiles stand alone, so their row is always full (components/dashboard/sections.tsx tileSpans).
          const span = grid ? tileSpans(headline.length)[i] : undefined;
          if (now) return <StatTile key={h.id} className={span} label={h.label} value={now.text} extra={bar(h.range ? movedTo(h.range, now.value) : null)} detail={now.detail ?? h.detail ?? undefined} badge={readBadge} />;
          const fresh = h.markets ? headlineFresh.markets : h.prices ? restingFresh(headlineFresh.book, live, open) : headlineFresh.book;
          return <StatTile key={h.id} className={span} label={h.label} value={h.text} extra={bar(h.range)} detail={h.detail ?? undefined} badge={fresh ? <FreshBadge compact fresh={fresh} /> : null} />;
        })}
      </div>
      )}
      {s.problem && !book ? <p className="-mt-3 mb-6 px-1 text-footnote text-text-secondary">{s.problem}</p> : null}
      {beforeChart}
      {chart ? <ReturnChart data={chart} live={live ? { bookRatio: book && netWorth > 0 ? book.netWorth / netWorth : null, quotes: s.quotes, at: s.at } : null} open={open} bookFresh={bookRest} liveBadge={readBadge} /> : null}
      {session ? (
        <section id="session" className="scroll-mt-20" data-live={now ? "session" : "close"}>
          <h2 className="section-header mb-1 px-1">The session</h2>
          <p className="mb-4 px-1 text-footnote text-text-secondary">{session.intro}</p>
          {day && session.show.indices && day.indices.length ? (
            <IndexCards
              day={day}
              badge={sessionBadge}
              {...(sessionLive ? { label: "US indices so far today", note: "Five-minute prices so far today from Yahoo Finance; the dashed line is yesterday's close. Refreshed every minute while the market is open." } : {})}
            />
          ) : null}
          {dayOn ? bookCard : null}
          {day && session.show.heatmap && day.moves.length ? (
            <div className="mb-8">
              <HeatMap day={day} held={session.held} badge={sessionBadge} live={sessionLive} drivers={drivers} />
            </div>
          ) : drivers.length ? (
            <IndexDriversCard list={drivers} held={session.held} session={day!.session} badge={sessionBadge} live={sessionLive} />
          ) : null}
          {day && session.show.movers && day.moves.length ? <Movers day={day} held={session.held} badge={sessionBadge} /> : null}
          {now?.problems.length ? <p className="-mt-6 mb-8 px-1 text-footnote text-text-secondary">{now.problems.join(" ")}</p> : null}
          {ss.problem && !now && live ? <p className="mb-8 px-1 text-footnote text-text-secondary">{ss.problem} The last close is shown.</p> : null}
          {day && day.problems.length ? (
            <ListSection header="Not read this session" className="mb-8">
              {day.problems.map((p) => (
                <ListRow key={p} wrap label={p} />
              ))}
            </ListSection>
          ) : null}
        </section>
      ) : (
        <>
          {dayOn ? bookCard : null}
        </>
      )}
    </div>
  );
}

const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)} pts`;

/**
 * The book's lead over a benchmark this year, on the arrow between them: in
 * its move colour, ahead or behind in words. The arrow fills the whole gap
 * between the two figures, head to head against each card, so the lead
 * reads as the distance between them (Hamza, 16 Oct 2026).
 */
function Spread({ value, against }: { value: number | null; against: string }) {
  const color = value === null ? "var(--text-tertiary)" : value > 0 ? "var(--move-up)" : value < 0 ? "var(--move-down)" : "var(--text-tertiary)";
  return (
    <div className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-center text-center" aria-label={value === null ? `No spread against ${against}` : `${Math.abs(value).toFixed(1)} points ${value >= 0 ? "ahead of" : "behind"} ${against}`}>
      <span className="data text-footnote font-semibold sm:text-headline" style={{ color }}>
        {value === null ? "–" : pts(value)}
      </span>
      <span className="my-1 flex w-full items-center text-text-secondary" aria-hidden>
        <ChevronLeft className="-mr-1 size-4 shrink-0 sm:size-5" strokeWidth={2.5} />
        <span className="h-[2px] flex-1 rounded-full bg-current" />
        <ChevronRight className="-ml-1 size-4 shrink-0 sm:size-5" strokeWidth={2.5} />
      </span>
      <span className="text-caption text-text-tertiary">{value === null ? "" : value >= 0 ? "ahead" : "behind"}</span>
    </div>
  );
}

function YearCellView({ cell, main, open }: { cell: YearStrip["cells"][number]; main?: boolean; open: boolean }) {
  return (
    <div className={cn("min-w-0 basis-[23%] shrink-0 rounded-card px-1 py-2.5 text-center sm:basis-[24%] sm:px-3", main ? "bg-accent-subtle ring-1 ring-accent/40" : "bg-surface-2 ring-1 ring-hairline")}>
      <p className="text-caption font-medium text-text-secondary">
        {cell.key === "book" ? (
          <>
            <span className="sm:hidden">Yours</span>
            <span className="hidden sm:inline">{cell.label}</span>
          </>
        ) : (
          cell.label
        )}
      </p>
      <p className={cn("data figure-in mt-0.5 font-semibold tracking-[-0.01em]", main ? "text-title-3 sm:text-title-1" : "text-headline sm:text-title-2")}>{cell.pct === null ? "–" : signedPct(cell.pct, 1)}</p>
      <p className="data mt-0.5 text-caption text-text-tertiary">{cell.pct === null ? (cell.key === "book" ? "No value series" : "No close yet") : cell.live && open ? "now" : cell.asOf ? `to ${dayWords(cell.asOf)}` : ""}</p>
    </div>
  );
}

/**
 * This year on the Dashboard (Hamza, 15 Oct 2026): SPY, the book, QQQ, each
 * its return this year on its own card, and on the arrows between them the
 * book's lead in percentage points, each arrow running card to card. Live
 * while the market is open; otherwise to the last session's close.
 */
function YearStripCard({ strip, badge, open }: { strip: YearStrip; badge: React.ReactNode; open: boolean }) {
  const [spy, mine, qqq] = strip.cells;
  return (
    <section className="card mb-3 px-3 py-3 sm:px-4" aria-label="Return this year against SPY and QQQ">
      <h2 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <span className="section-header">This year</span>
        {badge}
      </h2>
      <div className="flex items-stretch gap-1">
        <YearCellView cell={spy} open={open} />
        <Spread value={strip.spreads[0]} against="SPY" />
        <YearCellView cell={mine} main open={open} />
        <Spread value={strip.spreads[1]} against="QQQ" />
        <YearCellView cell={qqq} open={open} />
      </div>
      <p className="mt-2 px-1 text-caption text-text-tertiary">SPY and QQQ as the S&amp;P 500 and the Nasdaq-100 move, before dividends; your portfolio from its value series. While the market is open each moves with today&apos;s prices.</p>
    </section>
  );
}

const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

