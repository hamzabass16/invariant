"use client";

import * as React from "react";

import { DoneMark } from "@/components/app/done-mark";
import { reach } from "@/components/app/reach";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { shortDate } from "@/lib/time";

import { removePushDeviceAction, savePushDeviceAction, testPushAction } from "@/app/(app)/notifications/actions";

type Kept = { endpoint: string; label: string; addedAt: string };
type Support = "checking" | "none" | "home-screen" | "ready";

/** The deployment's public key as the bytes pushManager.subscribe takes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function supportOf(): Support {
  if (typeof window === "undefined") return "checking";
  const apple = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (apple && !standalone) return "home-screen";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ready" : "none";
}

const noChange = () => () => {};

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

/**
 * Notifications on this phone or browser (Hamza, 20 Oct 2026): one after each
 * US close recapping what fired that day. Turn on registers the service
 * worker (public/sw.js), asks the browser's permission and keeps the push
 * address in the person's vault (lib/push.ts); Send a test sends one at once.
 * An iPhone sends them only to an app added to its Home Screen, so it says so.
 */
export function PushCard({ publicKey, problem, devices, lastSentAt, demo }: { publicKey: string | null; problem: string | null; devices: Kept[]; lastSentAt: string | null; demo: boolean }) {
  const support = React.useSyncExternalStore(noChange, supportOf, () => "checking" as Support);
  const [mine, setMine] = React.useState<string | null>(null);
  const [kept, setKept] = React.useState(devices);
  const [given, setGiven] = React.useState(devices);
  if (given !== devices) {
    setGiven(devices);
    setKept(devices);
  }
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (support !== "ready") return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((r) => r?.pushManager.getSubscription())
      .then((sub) => setMine(sub?.endpoint ?? null))
      .catch(() => setMine(null));
  }, [support]);

  const on = !!mine && kept.some((d) => d.endpoint === mine);
  const flash = (word: string) => {
    setDone(word);
    window.setTimeout(() => setDone(null), 2800);
  };

  const turnOn = () =>
    start(async () => {
      setError(null);
      if (!publicKey) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError(permission === "denied" ? "Notifications are blocked for this site; allow them in the browser's site settings, then turn them on here." : "The browser did not allow notifications.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const json = sub.toJSON();
        const r = await reach(() => savePushDeviceAction({ error: null }, form({ subscription: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) })));
        if (r.error) {
          setError(r.error);
          return;
        }
        setMine(sub.endpoint);
        setKept((k) => [...k.filter((d) => d.endpoint !== sub.endpoint), { endpoint: sub.endpoint, label: "This device", addedAt: new Date().toISOString() }]);
        flash("On");
      } catch {
        setError("This browser would not give a push address; try again, or use another browser.");
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      if (!mine) return;
      const r = await reach(() => removePushDeviceAction({ error: null }, form({ endpoint: mine })));
      if (r.error) {
        setError(r.error);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => false);
      setKept((k) => k.filter((d) => d.endpoint !== mine));
      setMine(null);
      flash("Off");
    });

  const test = () =>
    start(async () => {
      setError(null);
      if (!mine) return;
      const r = await reach(() => testPushAction({ error: null }, form({ endpoint: mine })));
      if (r.error) setError(r.error);
      else flash("Sent");
    });

  const others = kept.filter((d) => d.endpoint !== mine);
  const state = demo
    ? "With your own book, this device gets one notification after each US close, recapping what fired that day. The demo sends nothing."
    : problem
      ? problem
      : support === "home-screen"
        ? "An iPhone sends notifications only to an app on its Home Screen: in Safari press Share, then Add to Home Screen, open Invariant from there and turn them on."
        : support === "none"
          ? "This browser cannot show notifications from a web app."
          : on
            ? "On for this device. After each US close, one notification recaps what fired that day; nothing new, nothing sent."
            : "One notification after each US close, recapping what fired that day; nothing new, nothing sent. Amounts of money are masked, since it shows on a lock screen.";

  return (
    <ListSection header="On this device">
      <ListRow wrap label={on ? "Notifications are on" : "Notifications after the close"} detail={state} />
      {others.length ? <ListRow wrap label={`Also on ${others.length === 1 ? "one other device" : `${others.length} other devices`}`} detail={others.map((d) => `${d.label}, since ${shortDate(d.addedAt.slice(0, 10))}`).join(" · ")} /> : null}
      {lastSentAt && !demo ? <ListRow label="Last recap" value={shortDate(lastSentAt.slice(0, 10))} /> : null}
      {demo || problem || support !== "ready" ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          {on ? (
            <>
              <Button type="button" variant="secondary" loading={pending} onClick={test}>
                Send a test
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={turnOff}>
                Turn off
              </Button>
            </>
          ) : (
            <Button type="button" loading={pending} onClick={turnOn}>
              Turn on
            </Button>
          )}
          {done ? <DoneMark label={done} /> : null}
          {error ? <p className="w-full text-footnote text-danger">{error}</p> : null}
        </div>
      )}
    </ListSection>
  );
}
