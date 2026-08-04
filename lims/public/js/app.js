import { api, auth } from './api.js';
import { $, ROLE_LABEL, clear, el, initials, toastError } from './ui.js';

import { loginView } from './views/auth.js';
import { dashboardView } from './views/dashboard.js';
import { patientsView, patientCardView } from './views/patients.js';
import { ordersView, orderView, doctorQueueView } from './views/orders.js';
import { cashierView, debtsView } from './views/cashier.js';
import { staffView, monitoringView, auditView, catalogView, inventoryView, devicesView, settingsView } from './views/admin.js';
import { mobileView } from './views/mobile.js';
import { camerasView, attendanceView } from './views/cameras.js';
import { queueView, queueStatsView } from './views/queue.js';

export const state = { user: null, lab: { name: 'LabCore', currency: "so'm" } };

/** Marshrutlar: [naqsh, ko'rinish, ruxsat etilgan rollar] */
const ROUTES = [
  [/^\/$/, dashboardView, null, 'Bosh sahifa'],
  [/^\/queue$/, queueView, null, 'Navbat'],
  [/^\/queue-stats$/, queueStatsView, ['admin'], 'Navbat statistikasi'],
  [/^\/patients$/, patientsView, null, 'Bemorlar'],
  [/^\/patients\/(\d+)$/, patientCardView, null, 'Bemor kartasi'],
  [/^\/orders$/, ordersView, null, 'Analizlar'],
  [/^\/orders\/(\d+)$/, orderView, null, 'Buyurtma'],
  [/^\/doctor$/, doctorQueueView, ['admin', 'doctor'], 'Shifokor navbati'],
  [/^\/cashier$/, cashierView, ['admin', 'cashier'], 'Kassa'],
  [/^\/debts$/, debtsView, ['admin', 'cashier'], 'Qarzdorlar'],
  [/^\/staff$/, staffView, ['admin'], 'Xodimlar'],
  [/^\/monitoring$/, monitoringView, ['admin'], 'Ish nazorati'],
  [/^\/audit$/, auditView, ['admin'], 'Audit jurnali'],
  [/^\/catalog$/, catalogView, ['admin'], 'Analiz katalogi'],
  [/^\/inventory$/, inventoryView, ['admin', 'laborant'], 'Ombor'],
  [/^\/devices$/, devicesView, ['admin'], 'Uskunalar'],
  [/^\/cameras$/, camerasView, ['admin'], 'Kameralar'],
  [/^\/attendance$/, attendanceView, ['admin'], 'Davomat'],
  [/^\/settings$/, settingsView, null, 'Sozlamalar'],
  [/^\/mobile$/, mobileView, null, 'Rahbar paneli'],
];

/** Telefon yoki o'rnatilgan ilova (PWA) rejimimi? */
export const isMobile = () =>
  window.matchMedia('(max-width: 700px)').matches ||
  window.matchMedia('(display-mode: standalone)').matches;

const NAV = [
  { group: 'Ish joyi' },
  { path: '/', label: 'Bosh sahifa', icon: '📊' },
  { path: '/mobile', label: 'Rahbar paneli', icon: '📱' },
  { path: '/queue', label: 'Navbat', icon: '📞' },
  { path: '/patients', label: 'Bemorlar', icon: '👤' },
  { path: '/orders', label: 'Analizlar', icon: '🧪' },
  { path: '/doctor', label: 'Shifokor navbati', icon: '🩺', roles: ['admin', 'doctor'] },
  { group: 'Moliya', roles: ['admin', 'cashier'] },
  { path: '/cashier', label: 'Kassa', icon: '💰', roles: ['admin', 'cashier'] },
  { path: '/debts', label: 'Qarzdorlar', icon: '📄', roles: ['admin', 'cashier'] },
  { group: 'Boshqaruv', roles: ['admin', 'laborant'] },
  { path: '/staff', label: 'Xodimlar', icon: '👥', roles: ['admin'] },
  { path: '/monitoring', label: 'Ish nazorati', icon: '🖥️', roles: ['admin'] },
  { path: '/audit', label: 'Audit jurnali', icon: '🔍', roles: ['admin'] },
  { path: '/catalog', label: 'Analiz katalogi', icon: '📋', roles: ['admin'] },
  { path: '/inventory', label: 'Ombor', icon: '📦', roles: ['admin', 'laborant'] },
  { path: '/devices', label: 'Uskunalar', icon: '🔬', roles: ['admin'] },
  { path: '/cameras', label: 'Kameralar', icon: '🎥', roles: ['admin'] },
  { path: '/attendance', label: 'Davomat', icon: '📋', roles: ['admin'] },
  { path: '/queue-stats', label: 'Navbat statistikasi', icon: '📈', roles: ['admin'] },
];

const allowed = (roles) => !roles || roles.includes(state.user?.role);

export function navigate(path) {
  if (location.hash === '#' + path) render();
  else location.hash = '#' + path;
}

/**
 * Kirishdan keyin interfeysni chizadi. state.user allaqachon login javobidan
 * to'ldirilgan bo'ladi, shuning uchun qayta so'rov yuborilmaydi.
 */
export async function reboot() {
  await render();
}

async function render() {
  const app = $('#app');
  // Dastlabki "Yuklanmoqda…" uslubi (100vh markazlash) sahifa balandligini
  // cheklab qo'yadi — birinchi chizishdayoq olib tashlaymiz.
  app.classList.remove('loading');
  // Ochiq modal oyna bo'lsa yopamiz — aks holda "orqaga" tugmasidan keyin
  // ekranni to'sib turadi.
  clear($('#modal-root'));
  const path = (location.hash || '#/').slice(1) || '/';

  if (!state.user) {
    if (!auth.token) return clear(app).append(loginView());
    try {
      const me = await api.get('/auth/me');
      state.user = me.user;
      state.lab = me.lab;
    } catch (err) {
      // Faqat token haqiqiy rad etilganda chiqaramiz; tarmoq uzilishida token saqlanadi.
      if (err.status === 401 || err.status === 403) auth.token = null;
      else return clear(app).append(el('div.error-box', { text: `Serverga ulanib bo‘lmadi: ${err.message}` }));
      return clear(app).append(loginView());
    }
  }

  if (path === '/login') { navigate('/'); return; }

  // Telefonda yoki o'rnatilgan ilovada bosh sahifa o'rniga rahbar paneli.
  if (path === '/' && isMobile()) { navigate('/mobile'); return; }

  const match = ROUTES.find(([re]) => re.test(path));
  if (!match) return clear(app).append(shell(el('div.empty', { text: 'Sahifa topilmadi' }), 'Xatolik'));

  const [re, view, roles, title] = match;
  if (!allowed(roles)) {
    return clear(app).append(shell(el('div.card', {}, [
      el('h3', { text: 'Ruxsat yo‘q' }),
      el('p.muted', { text: `Bu bo‘lim ${state.user.role === 'laborant' ? 'laborant' : ROLE_LABEL[state.user.role]} roli uchun ochiq emas.` }),
    ]), 'Ruxsat yo‘q'));
  }

  const params = path.match(re).slice(1);
  const container = el('div');
  clear(app).append(shell(container, title));
  // Yangi bo'limga o'tganda sahifa boshidan ko'rsatiladi (brauzer eski
  // aylantirish holatini saqlab qolmasin).
  window.scrollTo(0, 0);

  try {
    const content = await view(...params);
    clear(container).append(content);
  } catch (err) {
    toastError(err);
    clear(container).append(el('div.error-box', { text: err.message }));
  }
}

function shell(content, title) {
  const u = state.user;

  const nav = el('nav.nav', {}, NAV.filter((i) => allowed(i.roles)).map((item) =>
    item.group
      ? el('div.group', { text: item.group })
      : el('a', {
          href: '#' + item.path,
          class: location.hash.slice(1) === item.path ? 'active' : '',
        }, [el('span', { text: item.icon }), item.label]),
  ));

  return el(`div.shell${isMobile() ? '.mobile-mode' : ''}`, {}, [
    el('aside.sidebar', {}, [
      el('div.brand', {}, [
        '🧪',
        el('div', {}, [state.lab.name, el('small', { text: 'LabCore LIMS' })]),
      ]),
      nav,
      el('div.side-foot', {}, [
        el('div', { text: `Ish stansiyasi: ${auth.computerName || 'avtomatik'}` }),
        el('a', { href: '#/settings', text: 'Sozlamalar' }),
      ]),
    ]),
    el('main.main', {}, [
      el('header.topbar', {}, [
        el('h2', { text: title }),
        el('div.userchip', {}, [
          el('div.avatar', { text: initials(u.full_name) }),
          el('div', {}, [
            el('div', { text: u.full_name }),
            el('div.small.muted', { text: ROLE_LABEL[u.role] }),
          ]),
        ]),
        el('button.sm', {
          text: 'Chiqish',
          onclick: async () => {
            try { await api.post('/auth/logout'); } catch { /* sessiya allaqachon yopiq */ }
            auth.token = null;
            state.user = null;
            location.hash = '#/login';
            location.reload();
          },
        }),
      ]),
      el('div.content', {}, [content]),
    ]),
  ]);
}

window.addEventListener('hashchange', render);
render();

// Ilovani telefonga/kompyuterga o'rnatish va oflayn ishlash uchun.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) =>
      console.warn('[sw] ro‘yxatdan o‘tmadi:', err.message));
  });
}
