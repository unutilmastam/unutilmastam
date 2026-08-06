/* BRILIANT — Service Worker */
const CACHE = 'briliant-v1';
const SHELL = [
  './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/api.js', './js/brands.js',
  './js/player.js', './js/screens.js', './js/live.js', './js/settings.js', './js/admin.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('briliant-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Video oqimlar, API va xarita — hech qachon keshlanmaydi
  if (/\.(m3u8|ts|mp4|m4s)$/.test(url.pathname) ||
      /\/(api|ws|whep|whip)\//.test(url.pathname) ||
      /api-maps\.yandex\.ru/.test(url.host)) return;

  // Sahifa navigatsiyasi: avval tarmoq, keyin kesh
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Ilova fayllari: kesh + fonda yangilash (stale-while-revalidate)
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(r => {
          if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return r;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // CDN (hls.js, shriftlar): avval kesh
  if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r;
      }))
    );
  }
});

/* --- Push bildirishnomalar --- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'BRILIANT', body: e.data?.text() || '' }; }
  const title = d.title || 'BRILIANT';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.cameraId || d.tag || 'briliant',
    renotify: true,
    data: { path: d.cameraId ? '/live/' + d.cameraId : d.path || '/notifications' },
    actions: [{ action: 'open', title: "Koʻrish" }],
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const path = e.notification.data?.path || '/notifications';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.includes('/cctv/')) { c.postMessage({ type: 'open', path }); return c.focus(); }
    }
    return self.clients.openWindow('./index.html#' + path);
  }));
});
