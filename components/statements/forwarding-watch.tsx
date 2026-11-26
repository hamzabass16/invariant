"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { watchForwardingAction, type Arrived, type ForwardingWatch as WatchState, type KeptConfirmation } from "@/app/(app)/statements/actions";
import { DoneMark } from "@/components/app/done-mark";
import { quietly } from "@/components/app/reach";
import { ForwardingFallback } from "@/components/statements/forwarding-fallback";
import type { ForwardingKind } from "@/lib/inbox";
import { localMoment } from "@/lib/time";

/** How often the page asks, and for how long after it opened or came back into view. */
const EVERY_MS = 30_000;
const FOR_MS = 20 * 60_000;

const HOW: Record<KeptConfirmation["how"], string> = { pressed: "the app pressed Google's Confirm itself", already: "Google reported the address verified" };

/**
 * Watches for Gmail's forwarding request to this person's address while the
 * page is open and confirms it by itself (Hamza, 18 Oct 2026): nothing to
 * click, nothing to type. Asks every half minute while the page is in view,
 * for twenty minutes after it opened or came back, says Confirmed only on
 * Google's own words, and otherwise offers Google's page for the one click
 * it asks (`ForwardingFallback`). A confirmation once made is kept in the
 * vault and shown from the first paint (`kept`), today and after. On
 * Newsletters the same look reads a newsletter the moment it lands and
 * refreshes the page, so the person sees the chain work (Hamza, 18 Oct 2026).
 */
export function ForwardingWatch({ kind = "statements", kept = null, next }: { kind?: ForwardingKind; kept?: KeptConfirmation | null; next: string }) {
  const router = useRouter();
  const [state, setState] = useState<WatchState | null>(null);
  const [arrived, setArrived] = useState<Arrived | null>(null);
  const [stopped, setStopped] = useState(false);
  const since = useRef(0);
  const confirmedNow = state?.confirmed === true;
  // Statements stops once confirmed; Newsletters keeps watching for the newsletters themselves.
  const done = kind === "statements" && confirmedNow;
  const keptAt = kept?.confirmedAt ?? null;
  useEffect(() => {
    if (done) return;
    since.current = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    let wasConfirmed = keptAt !== null;
    const look = async () => {
      if (!live || document.visibilityState !== "visible") return;
      if (Date.now() - since.current > FOR_MS) {
        setStopped(true);
        return;
      }
      // A look that did not reach the server (the network not back after sleep, a deployment since the page opened) is tried again at the next turn, never thrown into the page.
      const s = await quietly(() => watchForwardingAction(kind));
      if (!live) return;
      if (!s) {
        timer = setTimeout(look, EVERY_MS);
        return;
      }
      setState(s);
      const nowConfirmed = s.confirmed || s.kept !== null;
      if (s.arrived) setArrived(s.arrived);
      if (s.arrived || (nowConfirmed && !wasConfirmed)) router.refresh();
      wasConfirmed = nowConfirmed;
      // A kept confirmation with no newer request settles Statements after one look.
      const settled = s.confirmed || (s.kept !== null && !s.seen);
      if (kind === "newsletters" || !settled) timer = setTimeout(look, EVERY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      since.current = Date.now();
      setStopped(false);
      if (timer) clearTimeout(timer);
      void look();
    };
    void look();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [done, kind, keptAt, router]);

  const record = state?.kept ?? kept;
  const pending = state?.seen === true && !state.confirmed;
  const forwarding = (() => {
    if (state?.error) return <p className="text-footnote text-danger">{state.error}</p>;
    if (pending && state) return <ForwardingFallback forAddress={state.forAddress ?? ""} sentence={state.forwarding} code={state.code} link={state.link} next={next} />;
    if (record || confirmedNow) {
      return (
        <div className="rounded-[10px] bg-surface-2 px-3 py-3">
          <DoneMark label="Confirmed" />
          <p className="mt-1 text-subhead text-text">
            Gmail&rsquo;s forwarding{state?.forAddress ? ` from ${state.forAddress}` : ""} {record ? `was confirmed on ${localMoment(record.confirmedAt)}` : "is confirmed"}.
          </p>
          <p className="mt-1 text-footnote text-text-secondary">
            {record ? `${HOW[record.how].charAt(0).toUpperCase()}${HOW[record.how].slice(1)}; in Gmail the address shows as verified.` : "Google said so itself; in Gmail the address shows as verified."} {next}
          </p>
        </div>
      );
    }
    if (!state) return <p className="text-footnote text-text-secondary">Watching for Gmail&rsquo;s request to this address.</p>;
    if (stopped) return <p className="text-footnote text-text-secondary">No request from Gmail in the last twenty minutes. Add the address in Gmail (or click Re-send email beside it) and this page confirms it.</p>;
    return (
      <p className="flex items-center gap-2 text-footnote text-text-secondary">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
        Watching for Gmail&rsquo;s request to this address; it is confirmed here by itself within a minute of Gmail sending it.
      </p>
    );
  })();

  if (kind !== "newsletters") return forwarding;
  return (
    <div className="space-y-3">
      {forwarding}
      {arrived ? (
        <p className="text-footnote text-text">
          <span className="font-medium">{localMoment(arrived.at)}:</span> {arrived.sentence} It is under Read above.
        </p>
      ) : null}
      {stopped ? (
        <p className="text-footnote text-text-secondary">This page watched the inbox for twenty minutes. Check for newsletters now reads what came since; the morning refresh reads everything.</p>
      ) : state && !state.error ? (
        <p className="flex items-center gap-2 text-footnote text-text-secondary">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
          Watching the inbox: a newsletter that lands here is read within a minute and appears under Read above.
        </p>
      ) : null}
    </div>
  );
}
