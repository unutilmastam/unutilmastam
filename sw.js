/* ============================================================
   Unutilmas Ta'm — Service Worker
   VERSIYA: har safar index.html o'zgarganda CACHE_VER ni oshiring
   (v7-9 -> v8-0 ...). Shunda eski kesh avtomatik o'chadi.
   ============================================================ */
const CACHE_VER  = 'utam-v15-0';
const CORE_CACHE = CACHE_VER + '-core';
const RUN_CACHE  = CACHE_VER + '-run';

/* Offline uchun zarur asosiy fayllar */
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/base.css?v=150',
  '/css/components.css?v=150',
  '/css/layout.css?v=150',
  '/css/screens.css?v=150',
  '/css/polish.css?v=150',
  '/css/glassnav.css?v=150',
  '/css/glow.css?v=150',
  '/css/kitchen.css?v=150',
  '/js/shim-map.js?v=150',
  '/js/0-core.js?v=150',
  '/js/1-state.js?v=150',
  '/js/2-sync.js?v=150',
  '/js/3-auth.js?v=150',
  '/js/4-catalog.js?v=150',
  '/js/5-basket.js?v=150',
  '/js/6-orders.js?v=150',
  '/js/7-stores.js?v=150',
  '/js/8-map.js?v=150',
  '/js/9-courier.js?v=150',
  '/js/10-ledger.js?v=150',
  '/js/11-receipt.js?v=150',
  '/js/12-notify.js?v=150',
  '/js/13-admin.js?v=150',
  '/js/15-tally.js?v=150',
  '/js/16-rasterprint.js?v=150',
  '/js/17-motion.js?v=150',
  '/js/18-storepick.js?v=150',
  '/js/19-admintools.js?v=150',
  '/js/21-restorefx.js?v=150',
  '/js/22-storeledger.js?v=150',
  '/js/23-debtguard.js?v=150',
  '/js/20-i18n-ru.js?v=150',
  '/js/24-fbauth.js?v=150',
  '/js/25-finance.js?v=150',
  '/js/26-reorder.js?v=150',
  '/js/27-rewards.js?v=150',
  '/js/28-fx.js?v=150',
  '/js/30-storelink.js?v=150',
  '/js/14-boot.js?v=150',
  '/assets/logo.png?v=150',
  '/assets/logo-print.png?v=150',
  '/assets/slide-1.jpg?v=150',
  '/assets/slide-2.jpg?v=150',
  '/assets/slide-3.jpg?v=150',
  '/assets/slide-4.jpg?v=150',
  '/manifest.webmanifest?v=150',
  '/apple-touch-icon.png?v=150',
  '/favicon-32.png?v=150',
  '/favicon-16.png?v=150',
  '/icon-192.png?v=150',
  '/icon-512.png?v=150',
  '/icon-512-maskable.png?v=150'
];

/* Tashqi kutubxonalar — bir marta internetli holatda yuklanib keshga tushadi,
   keyin internetsiz ham ishlaydi:
     qrcode.min.js  — chekdagi QR kodni chizish
     jsQR.js        — kamera bilan QR skanerlash
     html2canvas    — chekni rasmga aylantirish
     jspdf          — chekni PDF qilish
   Xarita (Yandex) va Firebase ataylab keshlanmaydi — ular jonli ma'lumot. */
const LIB_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap'
];

/* ---------- INSTALL: asosiy fayllarni keshlash ---------- */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CORE_CACHE)
      .then(async c => {
        /* Asosiy fayllar — o'z serverimizdan */
        await Promise.allSettled(CORE_ASSETS.map(u => c.add(u)));
        /* Tashqi kutubxonalar — CDN sekin bo'lsa ham o'rnatishni to'xtatmasin */
        await Promise.allSettled(LIB_ASSETS.map(async u => {
          try{
            const res = await fetch(u, { mode: 'cors', cache: 'reload' });
            if (res && (res.ok || res.type === 'opaque')) await c.put(u, res);
          }catch(err){ /* internet yo'q bo'lsa keyingi safar keshlanadi */ }
        }));
      })
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE: eski versiya keshlarini o'chirish ---------- */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VER)).map(k => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/* ---------- Yordamchi ---------- */
function isHTML(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

/* Bu domenlar HECH QACHON keshlanmaydi (jonli ma'lumot) */
const NO_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'firebasestorage.googleapis.com',
  'api.telegram.org',
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'api-maps.yandex.ru'
];

/* ---------- FETCH ---------- */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (!url.protocol.startsWith('http')) return;
  if (NO_CACHE_HOSTS.some(h => url.hostname.includes(h))) return;

  /* HTML → network-first (yangi versiya darrov ko'rinadi) */
  if (isHTML(req)) {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        const net = preload || await fetch(req);
        const c = await caches.open(CORE_CACHE);
        c.put('/index.html', net.clone());
        return net;
      } catch (_) {
        return (await caches.match('/index.html')) ||
               (await caches.match('/')) ||
               new Response(
                 '<h1 style="font-family:sans-serif;text-align:center;padding:40px">Internet aloqasi yo\'q</h1>',
                 { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
               );
      }
    })());
    return;
  }

  /* Qolgan hammasi (rasm, css, js, font) → cache-first + fonda yangilash */
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(RUN_CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

/* ---------- Ilovadan xabar: darhol yangilanish ---------- */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
