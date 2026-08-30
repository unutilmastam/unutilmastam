import { api } from '../api.js';
import { state } from '../app.js';
import { el, fmtMoney, flagBadge, table, emptyRow } from '../ui.js';

/** Egasi uchun bosh sahifa: bugungi ko'rsatkichlar, ogohlantirishlar, dinamika. */
export async function dashboardView() {
  const d = await api.get('/dashboard');
  const cur = d.lab?.currency || state.lab.currency;

  const stats = [
    stat('👥', 'Bugungi bemorlar', d.today.patients_today, `${d.today.new_patients_today} ta yangi karta`),
    stat('🧪', 'Bugungi analizlar', d.today.tests_today, `${d.today.orders_today} ta buyurtma`),
    stat('✅', 'Tasdiqlangan natijalar', d.today.confirmed_today, 'bugun'),
    stat('🟢', 'Onlayn xodimlar', d.online, 'hozir ishlamoqda'),
  ];
  if (d.money) {
    stats.push(stat('💰', 'Bugungi daromad', fmtMoney(d.money.income_today, cur),
      `Oylik: ${fmtMoney(d.money.income_month, cur)}`));
  }
  stats.push(
    stat('⏳', 'Ish jarayonida', d.pending.in_work, `${d.pending.awaiting_confirm} ta tasdiqlash kutmoqda`),
    stat('📞', 'Bugungi navbat', d.today.appointments_today ?? 0,
      `${d.today.appointments_waiting ?? 0} tasi hali kelmagan`),
  );
  if (Number(d.pending.overdue) > 0) {
    stats.push(stat('⚠️', 'Muddati o‘tgan', d.pending.overdue, 'tezkor e’tibor talab qiladi'));
  }

  const critical = d.critical.length
    ? table(['Bemor', 'Analiz', 'Qiymat', 'Holat', 'Buyurtma'], d.critical.map((c) =>
        el('tr.clickable', { onclick: () => (location.hash = `#/orders/${c.order_id}`) }, [
          el('td', { text: `${c.last_name} ${c.first_name}` }),
          el('td', { text: c.test_name }),
          el('td.num.mono', { text: c.value ?? '—' }),
          el('td', {}, [flagBadge(c.flag)]),
          el('td.mono', { text: c.order_number }),
        ])))
    : el('div.empty', { text: 'So‘nggi 7 kunda kritik ko‘rsatkich qayd etilmagan' });

  const week = el('div', {}, d.week.map((w) => {
    const max = Math.max(...d.week.map((x) => Number(x.orders)), 1);
    return el('div.row', { style: 'gap:8px;margin-bottom:4px' }, [
      el('span.small.muted', { style: 'width:80px', text: dayLabel(w.day) }),
      el('div', {
        style: `height:14px;border-radius:4px;background:var(--primary);width:${(Number(w.orders) / max) * 70 + 2}%`,
      }),
      el('span.small', { text: `${w.orders} ta` }),
    ]);
  }));

  const topTests = table(['Analiz', '30 kun ichida'], d.topTests.length
    ? d.topTests.map((t) => el('tr', {}, [el('td', { text: t.name }), el('td.num', { text: t.c })]))
    : [emptyRow(2)]);

  const alerts = d.inventoryAlerts.length
    ? table(['Nomi', 'Qoldiq', 'Yaroqlilik'], d.inventoryAlerts.map((i) =>
        el('tr', {}, [
          el('td', { text: i.name }),
          el('td.num', { text: `${i.quantity} ${i.unit}` }),
          el('td', {}, [i.expiry_date
            ? el('span.badge.warn', { text: new Date(i.expiry_date).toLocaleDateString('uz-UZ') })
            : el('span.muted', { text: '—' })]),
        ])))
    : null;

  return el('div', {}, [
    el('div.grid.cols-4', { style: 'margin-bottom:16px' }, stats),
    el('div.grid.cols-2', {}, [
      el('div.card', {}, [el('h3', { text: '⚠️ Kritik natijalar' }), critical]),
      el('div.card', {}, [el('h3', { text: 'So‘nggi 2 hafta dinamikasi' }), week]),
      el('div.card', {}, [el('h3', { text: 'Eng ko‘p buyurtma qilingan analizlar' }), topTests]),
      alerts ? el('div.card', {}, [el('h3', { text: '📦 Ombor ogohlantirishlari' }), alerts]) : null,
    ]),
  ]);
}

/** "04.08" ko'rinishidagi qisqa sana — uz-UZ lokali "M08 04" beradi. */
function dayLabel(v) {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function stat(icon, label, value, hint) {
  return el('div.stat', {}, [
    el('div.label', {}, [icon, label]),
    el('div.value', { text: String(value ?? 0) }),
    hint ? el('div.hint', { text: hint }) : null,
  ]);
}
