"use client";

import * as React from "react";

const UNREAD_EVENT = "pos:unread";

/** Notifications tells the menu how many alerts are unread after Dismiss or Mark all read, which no longer redraw the layout. */
export function announceUnread(n: number) {
  window.dispatchEvent(new CustomEvent<number>(UNREAD_EVENT, { detail: n }));
}

/**
 * The menu's unread count: the server's, until Notifications announces a
 * new one, which holds until the server's own count changes (the next
 * refresh or reload, by then written).
 */
export function useUnread(server: number | undefined): number | undefined {
  const [told, setTold] = React.useState<{ server: number | undefined; n: number } | null>(null);
  const serverRef = React.useRef(server);
  React.useEffect(() => {
    serverRef.current = server;
  }, [server]);
  React.useEffect(() => {
    const on = (e: Event) => setTold({ server: serverRef.current, n: (e as CustomEvent<number>).detail });
    window.addEventListener(UNREAD_EVENT, on);
    return () => window.removeEventListener(UNREAD_EVENT, on);
  }, []);
  return told && told.server === server ? told.n : server;
}

/** The menu's badges with Notifications' count as last announced. */
export function useBadges<B extends Partial<Record<string, number>>>(badges: B): B {
  const n = useUnread(badges["/notifications"]);
  return n === badges["/notifications"] ? badges : { ...badges, "/notifications": n };
}
