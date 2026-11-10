/* Old London Pub service worker: network-first, with an offline cache. */
const CACHE = 'olp-v3';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/seed.js', './js/core.js', './js/config.js', './js/api.js', './js/i18n.js',
  './js/utils.js', './js/ai.js', './js/notifications.js', './js/app.js',
  './js/push.js', './js/vendor/qrcode.js',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/fonts/dm-sans-latin.woff2',
  './assets/fonts/playfair-latin.woff2',
  './assets/fonts/playfair-italic-latin.woff2',
  './assets/img/hero.jpg', './assets/img/live.jpg', './assets/img/quiz.jpg',
  './assets/img/stage.jpg', './assets/img/crowd.jpg', './assets/img/drinks.jpg',
  './assets/img/food.jpg', './assets/img/interior.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') !== -1) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

/* Push event: show notification from server payload. */
self.addEventListener('push', (event) => {
  let data = { title: 'Old London Pub', body: '' };
  try { data = Object.assign(data, event.data ? event.data.json() : {}); } catch (_) { /* plain text */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Old London Pub', {
      body: data.body || '',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      tag: data.tag || 'olp-push',
      data: { url: data.url || '/' }
    })
  );
});

/* Notification click: focus or open the site. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
