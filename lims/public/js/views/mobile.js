import { api } from '../api.js';
import { state } from '../app.js';
import {
  ACTION_LABEL, ROLE_LABEL, clear, el, fmtDateLong, fmtDateTime, fmtMoney, fmtTime,
  flagBadge, toastError,
} from '../ui.js';

/**
 * Rahbar uchun mobil panel.
 *
 * Telefonda o'qish uchun mo'ljallangan: yirik raqamlar, bitta ustun,
 * 30 soniyada bir yangilanadi. Tarmoq uzilsa oxirgi saqlangan
 * ko'rsatkichlar "eski ma'lumot" belgisi bilan ko'rsatiladi.
 */
export async function mobileView() {
  const root = el('div.mobile');
  let timer = null;

  async function load(silent = false) {
    if (!silent) clear(root).append(el('div.empty', { text: 'Yuklanmoqda…' }));
    try {
      const [d, online] = await Promise.all([
        api.get('/dashboard'),
        api.get('/monitoring/online').catch(() => ({ items: [] })),
      ]);
      clear(root).append(build(d, online));
    } catch (err) {
      if (!silent) clear(root).append(el('div.error-box', { text: err.message }));
      else toastError(err);
    }
  }

  // Sahifadan chiqilganda taymerni to'xtatamiz.
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);
  timer = setInterval(() => { if (!document.hidden) load(true); }, 30_000);

  await load();
  return root;
}

function build(d, online) {
  const cur = d.lab?.currency || state.lab.currency;
  const stale = d._offline;

  const tiles = [
    tile('👥', 'Bugungi bemorlar', d.today.patients_today, `${d.today.new_patients_today} ta yangi karta`),
    tile('🧪', 'Analizlar', d.today.tests_today, `${d.today.orders_today} ta buyurtma`),
    tile('✅', 'Tasdiqlangan', d.today.confirmed_today, 'natijalar'),
    tile('🟢', 'Onlayn xodim', d.online, `${d.pending.in_work} ta ish jarayonida`),
  ];
  if (d.money) {
    tiles.push(tile('💰', 'Bugungi daromad', fmtMoney(d.money.income_today, cur),
      `Oylik: ${fmtMoney(d.money.income_month, cur)}`, true));
  }
  if (Number(d.pending.overdue) > 0) {
    tiles.push(tile('⚠️', 'Muddati o‘tgan', d.pending.overdue, 'tezkor e’tibor kerak', false, 'danger'));
  }

  return el('div', {}, [
    stale ? el('div.offline-bar', { text: '⚠️ Aloqa yo‘q — oxirgi saqlangan ma’lumot ko‘rsatilmoqda' }) : null,

    el('div.m-head', {}, [
      el('div', {}, [
        el('div.m-title', { text: state.lab.name }),
        el('div.m-sub', { text: fmtDateLong() }),
      ]),
      el('button.sm', { text: '↻', title: 'Yangilash', onclick: () => location.reload() }),
    ]),

    el('div.m-tiles', {}, tiles),

    section('🟢 Hozir ishlayotganlar', online.items.length
      ? el('div', {}, online.items.map((o) => el('div.m-row', {}, [
          el('div', {}, [
            el('div', {}, [el('span.dot.online'), ' ', o.full_name]),
            el('div.small.muted', { text: `${ROLE_LABEL[o.role]} · ${o.computer_name || '—'}` }),
          ]),
          el('div.small.muted', { text: fmtTime(o.last_seen_at) }),
        ])))
      : el('div.empty', { text: 'Hozir hech kim tizimda emas' })),

    section('⚠️ Kritik natijalar (7 kun)', d.critical.length
      ? el('div', {}, d.critical.slice(0, 8).map((c) => el('a.m-row', {
          href: `#/orders/${c.order_id}`,
        }, [
          el('div', {}, [
            el('div', { text: `${c.last_name} ${c.first_name}` }),
            el('div.small.muted', { text: `${c.test_name}: ${c.value ?? '—'}` }),
          ]),
          flagBadge(c.flag),
        ])))
      : el('div.empty', { text: 'Kritik ko‘rsatkich yo‘q' })),

    d.inventoryAlerts.length
      ? section('📦 Ombor ogohlantirishlari', el('div', {}, d.inventoryAlerts.slice(0, 6).map((i) =>
          el('div.m-row', {}, [
            el('div', { text: i.name }),
            el('div.small.muted', { text: `${i.quantity} ${i.unit}` }),
          ]))))
      : null,

    state.user.role === 'admin' ? activityFeed() : null,

    el('div.m-links', {}, [
      link('👤', 'Bemorlar', '#/patients'),
      link('🧪', 'Analizlar', '#/orders'),
      link('🖥️', 'Ish nazorati', '#/monitoring'),
      link('🔍', 'Audit', '#/audit'),
      link('💰', 'Kassa', '#/cashier'),
      link('⚙️', 'Sozlamalar', '#/settings'),
    ].filter(Boolean)),
  ]);
}

/** So'nggi amallar lentasi — egasi telefonda kuzatishi uchun. */
function activityFeed() {
  const box = el('div.empty', { text: 'Yuklanmoqda…' });
  api.get('/monitoring/audit?limit=15&changes_only=1')
    .then((a) => {
      clear(box);
      box.className = '';
      box.append(...(a.items.length
        ? a.items.map((i) => el('div.m-feed', {}, [
            el('div.small.muted', { text: `${fmtDateTime(i.at)} · ${i.computer_name || '—'}` }),
            el('div', {}, [
              el('span.badge.info', { text: ACTION_LABEL[i.action] || i.action }), ' ',
              i.user_name || '—',
            ]),
            el('div.small', { text: i.description || '' }),
          ]))
        : [el('div.empty', { text: 'O‘zgarishlar yo‘q' })]));
    })
    .catch(() => { box.textContent = 'Lentani yuklab bo‘lmadi'; });
  return section('📝 So‘nggi o‘zgarishlar', box);
}

const section = (title, body) => el('div.m-card', {}, [el('h3', { text: title }), body]);

function tile(icon, label, value, hint, wide = false, kind = '') {
  return el(`div.m-tile${wide ? '.wide' : ''}${kind ? '.' + kind : ''}`, {}, [
    el('div.m-tile-label', {}, [icon, ' ', label]),
    el('div.m-tile-value', { text: String(value ?? 0) }),
    hint ? el('div.m-tile-hint', { text: hint }) : null,
  ]);
}

const link = (icon, label, href) => el('a.m-link', { href }, [el('span', { text: icon }), label]);
