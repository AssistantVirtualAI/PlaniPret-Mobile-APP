// Planiprêt push notification service worker (messaging only — NOT an app-shell cache)
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "Planiprêt", body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "Planiprêt";
  const opts = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
    actions: payload.actions || [],
    tag: payload.tag,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/mplanipret/home";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if (c.url.includes(url)) { c.focus(); return; } }
    self.clients.openWindow(url);
  })());
});
