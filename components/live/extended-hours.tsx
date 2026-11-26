"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";

import { extendedAnswerSchema, EXTENDED_POLL_SECONDS, sessionAt, SESSION_WORDS, type ExtendedAnswer, type SinceAsk } from "@/lib/extended-hours";
import { LIVE_CLOSED_POLL_SECONDS, LIVE_POLL_SECONDS } from "@/lib/live";
import { cn } from "@/lib/utils";
import { MoveMark } from "@/components/ui/move-mark";

const nowSession = () => sessionAt(Math.floor(Date.now() / 1000));

/** How often to ask: every minute while pre-market or after hours trade, every half minute in the session when a since-the-results tile is drawn, else rarely. */
function everySeconds(withSince: boolean): number {
  const s = nowSession();
  if (s === "pre" || s === "post") return EXTENDED_POLL_SECONDS;
  if (s === "regular" && withSince) return LIVE_POLL_SECONDS;
  return LIVE_CLOSED_POLL_SECONDS;
}

/**
 * Asks /api/live/extended for the symbols and the since-the-results asks,
 * once on opening and then at the session's rhythm while the page is in view;
 * the symbols go in the body, never the URL. The demo asks once, for its
 * fictional sample of the prints after its last close.
 */
function useExtended(symbols: readonly string[], since: readonly SinceAsk[], demo: boolean): { answer: ExtendedAnswer | null; problem: string | null } {
  const [answer, setAnswer] = React.useState<ExtendedAnswer | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const key = JSON.stringify([symbols, since]);
  React.useEffect(() => {
    if (!symbols.length && !since.length) return;
    let stopped = false;
    let timer: number | undefined;
    let last = 0;
    const ask = async () => {
      last = Date.now();
      try {
        const res = await fetch("/api/live/extended", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols, since }) });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = extendedAnswerSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("shape");
        if (!stopped) {
          setAnswer(parsed.data);
          setProblem(null);
        }
      } catch {
        if (!stopped) setProblem("The prices before the open and after the close could not be read just now; asked again shortly.");
      }
    };
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && Date.now() - last >= everySeconds(since.length > 0) * 1000 - 500) void ask();
      timer = window.setTimeout(tick, 15_000);
    };
    void ask();
    // The demo's sample does not move; one answer is all there is.
    if (demo)
      return () => {
        stopped = true;
      };
    timer = window.setTimeout(tick, 15_000);
    const back = () => document.visibilityState === "visible" && Date.now() - last >= everySeconds(since.length > 0) * 1000 && void ask();
    document.addEventListener("visibilitychange", back);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
    };
    // The key carries the symbols and the asks; a new array with the same contents asks nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, demo]);
  return { answer, problem };
}

const NY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const NY_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", day: "numeric", month: "short" });
const nyWhen = (unix: number) => `${NY_TIME.format(new Date(unix * 1000))} New York, ${NY_DAY.format(new Date(unix * 1000))}`;
const tone = (pct: number) => (pct > 0 ? "text-ok" : pct < 0 ? "text-danger" : "text-text-secondary");
const signed = (pct: number) => `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
const priceIn = (v: number, ccy: string | null) => (ccy && ccy !== "USD" ? `${v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${ccy}` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`);

export type ExtendedSubject = { symbol: string; name: string; group: "holding" | "watch"; results: string | null };

/**
 * Before the open and after the close (Hamza, 4 Nov 2026), on At the Close:
 * each listed holding and watchlist company that traded pre-market or after
 * hours since the last close, its price and move against that close, the
 * companies with results first, then the largest moves. Asked every minute
 * while those sessions trade; between them the last prints stay, dated.
 */
export function ExtendedHours({ subjects, demo }: { subjects: readonly ExtendedSubject[]; demo: boolean }) {
  const symbols = React.useMemo(() => subjects.map((s) => s.symbol), [subjects]);
  const { answer, problem } = useExtended(symbols, [], demo);
  const by = new Map(subjects.map((s) => [s.symbol.toUpperCase(), s]));
  const moves = (answer?.moves ?? [])
    .map((m) => ({ m, s: by.get(m.symbol.toUpperCase()) }))
    .filter((x): x is { m: ExtendedAnswer["moves"][number]; s: ExtendedSubject } => !!x.s)
    .sort((a, b) => Number(!!b.s.results) - Number(!!a.s.results) || (a.s.group === b.s.group ? 0 : a.s.group === "holding" ? -1 : 1) || Math.abs(b.m.pct) - Math.abs(a.m.pct));
  const session = answer?.session ?? null;
  const live = session === "pre" || session === "post";
  const lead = live ? (session === "pre" ? "Pre-market is trading now" : "After hours is trading now") : "The last prints before the open or after the close";
  return (
    <section className="mb-8" aria-labelledby="extended-hours" data-public="">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="extended-hours" className="section-header">
          Before the open and after the close
        </h2>
        <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium", live ? "text-ok" : "text-text-tertiary")}>
          {live ? <span className="size-2 animate-pulse rounded-full bg-ok" aria-hidden /> : null}
          {answer ? (demo ? "The prints after the snapshot's last close" : lead) : "Reading"}
        </span>
      </div>
      {moves.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {moves.map(({ m, s }) => (
            <Link key={m.symbol} href={`/company/${encodeURIComponent(m.symbol.toUpperCase())}` as Route} className="card block px-3.5 py-3 hover:bg-surface-2">
              <span className="flex items-baseline justify-between gap-2">
                <span className="data text-subhead font-semibold">{m.symbol}</span>
                {s.results ? <span className="rounded-full bg-accent/15 px-2 py-0.5 text-caption text-accent-text">Results {s.results}</span> : s.group === "watch" ? <span className="text-caption text-text-tertiary">Watchlist</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-caption text-text-tertiary">{s.name}</span>
              <span className={cn("data mt-1.5 block text-title-3 font-semibold", tone(m.pct))}>
                <MoveMark pct={m.pct} className="mr-1 inline" />
                {signed(m.pct)}
              </span>
              <span className="data mt-0.5 block text-caption text-text-secondary">
                {SESSION_WORDS[m.session]} {priceIn(m.price, m.currency)}
              </span>
              <span className="mt-0.5 block text-caption text-text-tertiary">
                {nyWhen(m.at)} · against {m.session === "pre" ? "the last close" : "the close"} {priceIn(m.close, m.currency)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="card px-4 py-3 text-footnote text-text-secondary">
          {problem ?? (answer ? (answer.session === "regular" ? "The market is open; the live prices are on the Dashboard and Holdings. Pre-market and after-hours moves show here from 16:00 New York." : "None of your holdings or watchlist companies has traded before the open or after the close since the last session.") : "Reading the prices before the open and after the close.")}
        </p>
      )}
      {answer?.problems.length ? <p className="mt-2 px-1 text-caption text-text-tertiary">{answer.problems.slice(0, 3).join(" ")}</p> : null}
      <p className="mt-2 px-1 text-caption text-text-tertiary">
        {demo
          ? "A fictional sample in the demo. In your own app, each holding and watchlist company that trades pre-market (04:00 to 09:30 New York) or after hours (16:00 to 20:00) shows here, asked every minute while those sessions trade."
          : "Pre-market and after-hours trades are thinner than the session's; a move there is the last trade printed, from Yahoo Finance."}
      </p>
    </section>
  );
}

export type SinceSubject = SinceAsk & { name: string; date: string; href: string };

/**
 * How each company has traded since its results reached the SEC (Hamza,
 * 4 Nov 2026), beside the reports on Earnings: the last price now, whether
 * pre-market, in the session or after hours, against the last trade before
 * the release was accepted, else the close before the results. Asked every
 * half minute in the session and every minute before the open and after it.
 */
export function SinceResults({ subjects, demo }: { subjects: readonly SinceSubject[]; demo: boolean }) {
  const asks = React.useMemo(() => subjects.map(({ symbol, accepted, before }) => ({ symbol, accepted, before })), [subjects]);
  const { answer, problem } = useExtended([], asks, demo);
  if (!subjects.length) return null;
  const got = new Map((answer?.since ?? []).map((x) => [x.symbol.toUpperCase(), x]));
  return (
    <div className="mb-3" aria-label="Since the results" data-public="">
      <p className="mb-1.5 px-1 text-caption text-text-tertiary">Since the results came out, live before the open, in the session and after hours</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {subjects.map((s) => {
          const x = got.get(s.symbol.toUpperCase());
          return (
            <Link key={s.symbol} href={s.href as Route} scroll={false} className="card block px-3.5 py-3 hover:bg-surface-2">
              <span className="flex items-baseline justify-between gap-2">
                <span className="data text-subhead font-semibold">{s.symbol}</span>
                {x ? <span className={cn("text-caption", x.now.session === "pre" || x.now.session === "post" || x.now.session === "regular" ? "text-ok" : "text-text-tertiary")}>{SESSION_WORDS[x.now.session]}</span> : null}
              </span>
              {x ? (
                <>
                  <span className={cn("data mt-1 block text-title-3 font-semibold", tone(x.pct))}>
                    <MoveMark pct={x.pct} className="mr-1 inline" />
                    {signed(x.pct)}
                  </span>
                  <span className="data mt-0.5 block text-caption text-text-secondary">
                    {priceIn(x.now.price, x.currency)} at {nyWhen(x.now.at)}
                  </span>
                  <span className="mt-0.5 block text-caption text-text-tertiary">
                    {x.base.basis === "release" ? `From ${priceIn(x.base.price, x.currency)}, the last trade before the release at ${nyWhen(x.base.at)}` : `From the close before the results, ${priceIn(x.base.price, x.currency)}`}
                  </span>
                </>
              ) : (
                <span className="mt-1 block text-caption text-text-tertiary">{answer ? (problem ?? (demo ? "Not in the demo's sample." : "No trade since the release yet.")) : (problem ?? "Reading.")}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
