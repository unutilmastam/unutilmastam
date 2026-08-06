/* BRILIANT — ilova yadrosi: yoʻnaltirish, navigatsiya, SW, native koʻprik */
import { S, save, seedDemo, on, notify } from './store.js';
import { api } from './api.js';
import { h, ico, toast, renderRoute, currentPath, go, $ } from './ui.js';
import './screens.js';
import './live.js';
import './settings.js';
import './admin.js';

const root = document.getElementById('view');
const AUTH_PATHS = ['/login', '/register', '/forgot'];

/* --- Mavzu --- */
function applyTheme() {
  const t = S.settings.theme || 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0B0F14' : '#F2F5F9');
}

/* --- Pastki navigatsiya --- */
const NAV = [
  ['/dashboard', 'Asosiy', 'home'],
  ['/cameras', 'Kameralar', 'cam'],
  ['/live', 'Jonli', 'grid'],
  ['/events', 'Hodisalar', 'ai'],
  ['/settings', 'Sozlash', 'set'],
];
const nav = document.getElementById('nav');
function renderNav() {
  const path = currentPath();
  const hide = AUTH_PATHS.includes(path) || !S.user;
  nav.classList.toggle('hidden', hide);
  if (hide) return;
  const unread = S.notifs.filter(n => !n.read).length;
  nav.innerHTML = '';
  NAV.forEach(([p, label, icon]) => {
    const on = path === p || (p !== '/dashboard' && path.startsWith(p));
    const b = h('button', { class: on ? 'on' : '', onclick: () => go(p) });
    b.innerHTML = ico(icon, 21) + `<span>${label}</span>` + (icon === 'ai' && unread ? '<i class="dot"></i>' : '');
    nav.append(b);
  });
}

/* --- Yoʻnaltirish + himoya --- */
function render() {
  const path = currentPath();
  if (!S.user && !AUTH_PATHS.includes(path)) { go('/login', true); return; }
  if (S.user && AUTH_PATHS.includes(path)) { go('/dashboard', true); return; }
  renderRoute(root);
  renderNav();
}
addEventListener('hashchange', render);
on(() => renderNav());

/* --- Service worker --- */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e.message)));
}

/* --- "Ilovani oʻrnatish" taklifi --- */
let installEvt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e;
  if (localStorage.getItem('briliant:installed') || sessionStorage.getItem('briliant:nobanner')) return;
  setTimeout(showInstallBanner, 4000);
});
function showInstallBanner() {
  if (!installEvt || $('.install-banner')) return;
  const b = h('div', {
    class: 'install-banner toast', style: { display: 'flex', gap: '10px', alignItems: 'center' },
  },
    h('span', { html: ico('down', 18) }),
    h('span', {}, 'Ilovani oʻrnatasizmi?'),
    h('button', {
      class: 'btn sm', onclick: async () => {
        b.remove();
        installEvt.prompt();
        const r = await installEvt.userChoice;
        if (r.outcome === 'accepted') localStorage.setItem('briliant:installed', '1');
        installEvt = null;
      }
    }, "Oʻrnatish"),
    h('button', { class: 'iconbtn plain', html: ico('x', 16), onclick: () => { b.remove(); sessionStorage.setItem('briliant:nobanner', '1'); } }));
  document.body.append(b);
  setTimeout(() => b.remove(), 12000);
}
addEventListener('appinstalled', () => localStorage.setItem('briliant:installed', '1'));

/* --- iOS uchun qoʻlda oʻrnatish maslahati --- */
function iosHint() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!isIos || standalone || localStorage.getItem('briliant:ioshint')) return;
  setTimeout(() => {
    toast("Safari'da 'Ulashish → Home Screen' orqali ilovani oʻrnating");
    localStorage.setItem('briliant:ioshint', '1');
  }, 6000);
}

/* --- Android ilova koʻprigi (WebView) --- */
function bridgeInit() {
  if (!window.BRILIANT) return;
  document.documentElement.classList.add('native');
  // Push token
  try {
    const tok = window.BRILIANT.getPushToken?.();
    if (tok && api.enabled) api.post('/notifications/device', { platform: 'android', token: tok }).catch(() => {});
  } catch {}
  // Orqaga tugmasi
  window.__briliantBack = () => {
    if (document.querySelector('.sheet')) { document.querySelector('.veil')?.click(); return true; }
    if (currentPath() === '/dashboard' || currentPath() === '/login') return false;
    history.back(); return true;
  };
}

/* --- Demo rejimda fon hodisalari --- */
let demoTimer;
function demoHeartbeat() {
  clearInterval(demoTimer);
  if (!S.settings.demo) return;
  demoTimer = setInterval(() => {
    if (!S.cameras.length || document.hidden) return;
    // Kamera holatini vaqti-vaqti bilan oʻzgartirish
    if (Math.random() < 0.06) {
      const cam = S.cameras[Math.floor(Math.random() * S.cameras.length)];
      const was = cam.online;
      cam.online = Math.random() > 0.2;
      cam.lastSeen = Date.now();
      save('cameras');
      if (was && !cam.online) notify('Kamera oflayn', cam.name + ' — ulanish uzildi', 'offline', cam.id);
      if (!was && cam.online) notify('Kamera qaytdi', cam.name + ' — onlayn', 'info', cam.id);
    }
  }, 20000);
}

/* --- Ishga tushirish --- */
applyTheme();
if (S.user && S.settings.demo) seedDemo();
if (S.user && !S.settings.demo && S.settings.apiBase) api.connectWs();
bridgeInit();
iosHint();
demoHeartbeat();
on(() => demoHeartbeat());
render();

// Bildirishnoma bosilganda kerakli kameraga oʻtish
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'open' && e.data.path) go(e.data.path);
});

// Ilova fokusga qaytganda holatni yangilash
addEventListener('visibilitychange', () => {
  if (!document.hidden && S.user && !S.settings.demo && S.settings.apiBase) api.connectWs();
});

export { render };
