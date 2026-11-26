"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { noteQuoteShownAction } from "@/app/(app)/greeting-actions";
import { quietly } from "@/components/app/reach";
import { greetingFor, isLaunch, mergedShown, nextQuote, quoteKey, shouldGreet, withShown } from "@/lib/greeting";

/** The device's own note of when the greeting last showed; a convenience, so a cleared or blocked store only means one more greeting. */
export const LAST_GREETED_KEY = "pos:last-greeted";

/** The device's own note of the last tap, key or scroll in the app, any tab: a greeting never meets activity in the last AWAY_MS. */
export const LAST_ACTIVE_KEY = "pos:last-active";

/** The quotes this device has shown, laid on the person's own record (lib/greeting.ts mergedShown), so a greeting the page has not read back yet still counts. */
export const QUOTES_SHOWN_KEY = "pos:quotes-shown";

type Shown = ReturnType<typeof greetingFor>;

function readNumber(key: string): number | null {
  try {
    const kept = window.localStorage.getItem(key);
    return kept === null ? null : Number(kept);
  } catch {
    return null;
  }
}

function writeNumber(key: string, at: number) {
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    // No store on this device: only this page knows.
  }
}

/** This window's own note that the app has loaded in it: gone when the app is quit, kept through a reload. */
const OPENED_KEY = "pos:opened";

let launchedHere: boolean | null = null;

/** Whether this load is a launch after the app was quit, and notes the window as opened either way. Read once per load. */
function launched(): boolean {
  if (launchedHere !== null) return launchedHere;
  let noted = true;
  try {
    noted = window.sessionStorage.getItem(OPENED_KEY) !== null;
    window.sessionStorage.setItem(OPENED_KEY, "1");
  } catch {
    // No window store: only the time away decides.
  }
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  launchedHere = isLaunch(nav?.type, noted);
  return launchedHere;
}

/** The record in this tab when the device keeps no store. */
let shownHere: string[] = [];

/** The person's next quote, from their own record (null in the demo) and this device's, noted on both; the vault's is written behind the greeting. */
function takeNext(kept: readonly string[] | null) {
  let device: unknown = shownHere;
  try {
    const raw = window.localStorage.getItem(QUOTES_SHOWN_KEY);
    if (raw) device = JSON.parse(raw);
  } catch {
    // An unreadable record is this tab's.
  }
  const record = mergedShown(kept ?? [], Array.isArray(device) ? device : []);
  const quote = nextQuote(record);
  const key = quoteKey(quote);
  shownHere = withShown(record, key);
  try {
    window.localStorage.setItem(QUOTES_SHOWN_KEY, JSON.stringify(shownHere));
  } catch {
    // No store on this device: the record lives in this tab and the vault.
  }
  if (kept !== null) void quietly(() => noteQuoteShownAction(key));
  return quote;
}

/** Activity worth noting at most this often, so a scroll does not write the store on every frame. */
const ACTIVE_NOTE_MS = 10_000;

/**
 * The greeting when the person comes back (Hamza, 4 Nov 2026: "it should
 * greet the user back"): asked only when the app opens or comes back into
 * view, never on a timer while it is open, and never within a quarter hour
 * of the last tap, key or scroll on the device, so it never lands while they
 * are pressing something. By the person's own clock, with their next quote
 * (`nextQuote`): the record is theirs, in their preferences, shared by every
 * device, so a quote comes round only after every other has shown. It covers
 * the screen and closes on a tap, a key or after a few seconds. The device
 * keeps the time of the last greeting, the last activity and the quotes it
 * showed; nothing else is kept.
 */
export function Greeting({ name, shown: kept }: { name: string | null; shown: readonly string[] | null }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const keptRef = useRef(kept);
  useEffect(() => {
    keptRef.current = kept;
  }, [kept]);

  useEffect(() => {
    let frame = 0;
    let launch = launched();
    let noted = 0;
    const active = () => {
      const now = Date.now();
      if (now - noted < ACTIVE_NOTE_MS) return;
      noted = now;
      writeNumber(LAST_ACTIVE_KEY, now);
    };
    const greetIfBack = () => {
      const now = Date.now();
      const due = shouldGreet({ lastGreeted: readNumber(LAST_GREETED_KEY), lastActive: readNumber(LAST_ACTIVE_KEY), now, launch });
      launch = false;
      // Opening or coming back is itself the start of a visit: the quarter hour runs from here.
      noted = 0;
      active();
      if (!due) return;
      // Noted when it is drawn, so a load cut short (or run twice in development) still greets.
      frame = window.requestAnimationFrame(() => {
        writeNumber(LAST_GREETED_KEY, now);
        const d = new Date(now);
        const today = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
        setLeaving(false);
        setShown(greetingFor({ ...today, hour: d.getHours() }, name, takeNext(keptRef.current)));
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") greetIfBack();
      // Leaving is the last moment of use: the time away counts from here.
      else writeNumber(LAST_ACTIVE_KEY, Date.now());
    };
    greetIfBack();
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, active, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const e of events) window.removeEventListener(e, active, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [name]);

  const close = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (!shown) return;
    const long = shown.quote.text.length + (shown.quote.context?.length ?? 0);
    const timer = window.setTimeout(close, Math.min(14_000, 6_000 + long * 30));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [shown, close]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setShown(null), 320);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!shown) return null;
  const { title, eyebrow, quote } = shown;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-greeting
      onClick={close}
      className={`fixed inset-0 z-[60] flex cursor-pointer items-center justify-center bg-bg/95 px-6 backdrop-blur-md transition-opacity duration-300 motion-reduce:transition-none ${leaving ? "opacity-0" : "figure-in opacity-100"}`}
    >
      <div className="w-full max-w-[34rem]">
        {eyebrow ? <p className="section-header">{eyebrow}</p> : null}
        <h1 className="mt-1 font-display text-large-title font-medium tracking-[-0.01em] text-text">{title}</h1>
        <div className="mt-6 h-px w-12 bg-accent" aria-hidden />
        <figure className="mt-6">
          <blockquote className="text-title-3 leading-snug text-text">“{quote.text}”</blockquote>
          {quote.by ? <figcaption className="mt-3 text-subhead text-text-secondary">{quote.by}</figcaption> : null}
          {quote.context ? <p className="mt-2 text-footnote text-text-tertiary">{quote.context}</p> : null}
        </figure>
        <p className="mt-10 text-caption text-text-tertiary">Tap anywhere to continue</p>
      </div>
    </div>
  );
}
