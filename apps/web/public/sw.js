/*
 * Restaurant OS service worker: notifications only (no caching, so a new deploy is never hidden
 * behind stale files).
 *
 * Push payload (sent by apps/api/src/services/push.ts):
 *   { title, body, url, tag, kind, requireInteraction?, renotify?, vibrate? }
 * Pages can also ask it to show a notification with postMessage({ type: 'notify', ...payload }).
 */
const ICON = '/icon.svg';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function show(data) {
  const title = data.title || 'Restaurant OS';
  return self.registration.showNotification(title, {
    body: data.body || '',
    icon: ICON,
    badge: ICON,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag && data.renotify),
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : [120],
    data: { url: data.url || '/', kind: data.kind || 'order' },
  });
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Restaurant OS', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // Tell open pages so they can refresh at once (they show their own in-app banner).
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'push', payload: data });
      // Always show a system notification for a push: browsers require it.
      await show(data);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'notify') event.waitUntil(show(event.data));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer a tab already on this page, then any tab of this site.
      const exact = windows.find((w) => w.url === target);
      if (exact) return exact.focus();
      const same = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) {
        await same.focus();
        return same.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
