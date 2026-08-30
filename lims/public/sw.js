/**
 * Service worker — mobil ilova va Windows dasturi uchun.
 *
 * Maqsad: laboratoriya tarmog'i uzilganda ham ilova ochilsin va oxirgi
 * ko'rilgan ko'rsatkichlar ko'rinsin. Tibbiy ma'lumot uzoq muddat
 * keshda saqlanmaydi — faqat oxirgi javob va faqat o'qish uchun.
 */

const SHELL_CACHE = 'labcore-shell-v2';
const DATA_CACHE = 'labcore-data-v2';

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/ui.js',
  './js/views/auth.js',
  './js/views/dashboard.js',
  './js/views/mobile.js',
  './js/views/patients.js',
  './js/views/orders.js',
  './js/views/cashier.js',
  './js/views/admin.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API: avval tarmoq, uzilsa — oxirgi saqlangan javob.
  if (url.pathname.startsWith('/api/')) {
    // Faqat ko'rsatkichlarni keshlaymiz; fayl va hujjatlar keshga tushmaydi.
    const cacheable = ['/api/dashboard', '/api/monitoring/online', '/api/auth/me']
      .some((p) => url.pathname === p || url.pathname.startsWith(p + '?'));

    event.respondWith(
      // cache: 'no-store' — brauzerning o'z keshi javob bermasin. Aks holda
      // aloqa uzilganda eski raqamlar "yangi" bo'lib ko'rinadi va rahbar
      // ma'lumot eskirganini bilmay qoladi.
      fetch(request, { cache: 'no-store' })
        .then((res) => {
          if (cacheable && res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = cacheable ? await caches.match(request) : null;
          if (hit) {
            // Klient bu javob eskiligini bilishi uchun belgi qo'yamiz.
            const body = await hit.json();
            return new Response(JSON.stringify({ ...body, _offline: true }), {
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(
            JSON.stringify({ error: 'Server bilan aloqa yo‘q. Tarmoqni tekshiring.' }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }),
    );
    return;
  }

  // Statik fayllar: avval kesh, keyin tarmoq.
  event.respondWith(
    caches.match(request).then((hit) =>
      hit || fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html')),
    ),
  );
});
