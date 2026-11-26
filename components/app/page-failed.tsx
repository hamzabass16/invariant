"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { mayReload, mendsOnReload, pageFailedWords } from "@/lib/reach";
import { maskMoney } from "@/lib/stealth";

/** This tab's note of when it last reloaded by itself, so a failure that a reload does not mend shows its card instead of reloading again and again. */
const RELOADED_KEY = "pos:auto-reload";

/** Nothing outside the page changes the plan while it is shown. */
const noChange = () => () => {};

function lastReload(): number | null {
  try {
    const v = window.sessionStorage.getItem(RELOADED_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * What a screen shows when it fails, in place of Next's own "This page
 * couldn't load" (Hamza, 23 Oct 2026). A failure a reload mends (the
 * network not back after the computer wakes, or a new version deployed
 * since the page opened) reloads by itself, once a minute at most, and
 * waits for the connection when the browser is offline; any other says
 * what failed, with Reload and the way back to the Dashboard. The detail
 * line names the error itself, with every amount masked.
 */
export function PageFailed({ error }: { error: Error & { digest?: string } }) {
  // Read in the browser alone: whether this failure reloads by itself, and whether it waits for the connection.
  const plan = React.useSyncExternalStore(
    noChange,
    () => (!(mendsOnReload(error) && mayReload(lastReload(), Date.now())) ? "stay" : navigator.onLine === false ? "offline" : "reload"),
    () => null,
  );
  const mends = plan === "reload" || plan === "offline";
  const words = pageFailedWords(error, plan === null ? mendsOnReload(error) : mends);
  React.useEffect(() => {
    if (!mends) return;
    const go = () => {
      try {
        window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
      } catch {
        // No store in this tab: the guard is the minute alone.
      }
      window.location.reload();
    };
    if (plan === "offline") {
      window.addEventListener("online", go, { once: true });
      return () => window.removeEventListener("online", go);
    }
    const timer = window.setTimeout(go, 600);
    return () => window.clearTimeout(timer);
  }, [mends, plan]);
  const detail = maskMoney(`${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message ?? ""}`).slice(0, 160);
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-14" role="alert">
      <h1 className="text-title2 font-semibold text-text">{words.title}</h1>
      <p className="mt-2 text-body text-text-secondary">{words.sentence}</p>
      {plan === null ? null : mends ? (
        <p className="mt-4 flex items-center gap-2 text-footnote text-text-tertiary">
          <RotateCw className="size-4 animate-spin" aria-hidden /> {plan === "offline" ? "Waiting for the connection." : "Loading again."}
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-control bg-surface-2 px-4 text-body font-medium text-text">
            Back to the Dashboard
          </Link>
        </div>
      )}
      {detail || error.digest ? (
        <p className="mt-6 break-words text-caption1 text-text-tertiary">
          {detail}
          {error.digest ? `${detail ? " · " : ""}Reference ${error.digest}` : ""}
        </p>
      ) : null}
    </main>
  );
}
