"use client";

import { unreachedSentence } from "@/lib/reach";

export type NoticeChange = { dismiss: string[] } | { read: true };

let queue: Promise<unknown> = Promise.resolve();

async function post(change: NoticeChange): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change), keepalive: true, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const error = body && typeof body.error === "string" ? body.error : null;
    if (res.ok) return { error };
    return { error: error ?? unreachedSentence(new Error("An unexpected response was received from the server.")) };
  } catch (e) {
    return { error: unreachedSentence(e) };
  }
}

/**
 * Sends a dismissal or Mark all read to the vault, outside any React
 * transition, so moving to another screen never waits for it (Hamza,
 * 23 Oct 2026). One at a time: each reads the alerts file and writes it
 * back, so two at once would lose one of them. `keepalive` lets a send
 * finish after the page is left.
 */
export function sendNotice(change: NoticeChange): Promise<{ error: string | null }> {
  const next = queue.then(() => post(change));
  queue = next;
  return next;
}
