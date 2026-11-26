/*
 * Invariant's service worker: it only shows the notification the app sends
 * after a close (lib/push.ts) and opens the page it names when pressed. It
 * caches nothing and reads nothing.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let m = { title: "Invariant", body: "", url: "/notifications", tag: "portfolioos" };
  try {
    m = { ...m, ...(event.data ? event.data.json() : {}) };
  } catch {
    m.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(self.registration.showNotification(m.title, { body: m.body, tag: m.tag, icon: "/icon-256.png", badge: "/icon-256.png", data: { url: m.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/notifications";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
