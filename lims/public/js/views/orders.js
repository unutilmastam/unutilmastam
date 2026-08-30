import { api } from '../api.js';
import { state } from '../app.js';
import {
  age, clear, el, emptyRow, flagBadge, fmtDate, fmtDateTime, fmtMoney, fullName,
  statusBadge, table, toastError, toastOk,
} from '../ui.js';

const canEnter = () => ['admin', 'laborant'].includes(state.user.role);

/** Ish ro'yxati: kunlik buyurtmalar, holat bo'yicha filtr, shtrix-kod bilan qidirish. */
export async function ordersView() {
  const box = el('div');
  const search = el('input', { placeholder: 'Bemor yoki buyurtma raqami…', style: 'min-width:220px' });
  const status = el('select', { style: 'max-width:180px' }, [
    el('option', { value: '', text: 'Barcha holatlar' }),
    el('option', { value: 'new', text: 'Yangi' }),
    el('option', { value: 'in_progress', text: 'Jarayonda' }),
    el('option', { value: 'ready', text: 'Tayyor (tasdiqlash kutmoqda)' }),
    el('option', { value: 'confirmed', text: 'Tasdiqlangan' }),
  ]);
  const from = el('input', { type: 'date', style: 'max-width:160px' });
  const to = el('input', { type: 'date', style: 'max-width:160px' });
  const barcode = el('input', { placeholder: 'Probirka shtrix-kodi…', style: 'max-width:220px' });

  async function load() {
    clear(box).append(el('div.empty', { text: 'Yuklanmoqda…' }));
    const q = new URLSearchParams();
    if (search.value.trim()) q.set('q', search.value.trim());
    if (status.value) q.set('status', status.value);
    if (from.value) q.set('from', from.value);
    if (to.value) q.set('to', to.value);

    try {
      const d = await api.get('/orders?' + q);
      clear(box).append(table(
        ['Buyurtma', 'Bemor', 'Analizlar', 'Holat', 'Yaratildi', 'Muddat', 'Summa'],
        d.items.length
          ? d.items.map((o) => el('tr.clickable', {
              onclick: () => (location.hash = `#/orders/${o.id}`),
            }, [
              el('td.mono', {}, [
                o.order_number,
                o.priority === 'urgent' ? el('span.badge.danger', { text: 'CITO' }) : null,
              ]),
              el('td', {}, [
                el('div', { text: `${o.last_name} ${o.first_name}` }),
                el('div.small.muted', { text: `${o.card_number} · ${age(o.birth_date) ?? '—'} yosh` }),
              ]),
              el('td.num', { text: `${o.entered_count}/${o.tests_count}` }),
              el('td', {}, [statusBadge(o.status)]),
              el('td.small', { text: fmtDateTime(o.created_at) }),
              el('td.small', {}, [
                o.due_at && ['new', 'in_progress'].includes(o.status) && new Date(o.due_at) < new Date()
                  ? el('span.badge.danger', { text: 'muddati o‘tdi' })
                  : el('span', { text: o.due_at ? fmtDateTime(o.due_at) : '—' }),
              ]),
              el('td.num', { text: fmtMoney(o.total_amount, state.lab.currency) }),
            ]))
          : [emptyRow(7, 'Buyurtma topilmadi')],
      ));
    } catch (err) {
      clear(box).append(el('div.error-box', { text: err.message }));
    }
  }

  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  for (const input of [status, from, to]) input.addEventListener('change', load);

  barcode.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !barcode.value.trim()) return;
    try {
      const hit = await api.get(`/labels/scan/${encodeURIComponent(barcode.value.trim())}`);
      barcode.value = '';
      location.hash = `#/orders/${hit.order_id}`;
    } catch (err) { toastError(err); }
  });

  load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row', {}, [search, status, from, to, el('div.spacer'), barcode]),
      el('p.small.muted', { style: 'margin:8px 0 0', text: 'Shtrix-kod skanerini "Probirka" maydoniga qarating — buyurtma avtomatik ochiladi.' }),
    ]),
    el('div.card', {}, [box]),
  ]);
}

/** Buyurtma kartasi: natijalarni kiritish, tasdiqlash, chop etish. */
export async function orderView(id) {
  const d = await api.get(`/orders/${id}`);
  const { order, items, summary } = d;
  const editable = canEnter() && order.status !== 'cancelled';

  const inputs = new Map();

  const rows = items.map((it) => {
    const value = it.value_text ?? (it.value_num !== null && it.value_num !== undefined ? it.value_num : '');
    const input = el('input.result-input', {
      value: String(value ?? ''),
      inputmode: it.value_type === 'number' ? 'decimal' : 'text',
      disabled: !editable,
    });
    inputs.set(it.order_item_id, input);

    const ref = it.range
      ? [it.range.low ?? '—', '–', it.range.high ?? '—'].join(' ')
      : '—';

    return el('tr', { class: it.flag ? `flag-${it.flag}` : '' }, [
      el('td', {}, [
        el('div', { text: it.name }),
        el('div.small.muted', { text: `${it.code} · ${it.category}` }),
      ]),
      el('td', {}, [input]),
      el('td.small', { text: it.unit || '—' }),
      el('td.small.mono', { text: ref }),
      el('td', {}, [flagBadge(it.flag)]),
      el('td.small', {}, [
        it.entered_by_name ? el('div', { text: `${it.entered_by_name} · ${fmtDateTime(it.entered_at)}` }) : el('span.muted', { text: 'kiritilmagan' }),
        it.confirmed_by_name ? el('div.badge.ok', { text: `✓ ${it.confirmed_by_name}` }) : null,
        it.revision > 1 ? el('div.badge.warn', { text: `${it.revision}-tahrir` }) : null,
      ]),
      el('td', {}, [
        el('a.small', { href: `/api/labels/barcode/${it.sample_barcode}`, target: '_blank', text: 'shtrix-kod' }),
      ]),
    ]);
  });

  const saveBtn = el('button.primary', {
    text: 'Natijalarni saqlash',
    disabled: !editable,
    onclick: async (e) => {
      // Tugmani o'zgaruvchiga olamiz: sahifa yangilangach currentTarget bo'sh bo'ladi.
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const payload = [...inputs.entries()].map(([order_item_id, input]) => ({
          order_item_id, value: input.value.trim(),
        }));
        const res = await api.post(`/orders/${order.id}/results`, { items: payload });
        toastOk(res.updated ? `${res.updated} ta natija saqlandi` : 'O‘zgarish yo‘q');
        if (res.updated) location.reload();
      } catch (err) { toastError(err); } finally { btn.disabled = false; }
    },
  });

  const confirmBtn = ['admin', 'laborant', 'doctor'].includes(state.user.role) && order.status === 'ready'
    ? el('button.primary', {
        text: '✓ Tasdiqlash',
        onclick: async () => {
          try {
            const res = await api.post(`/orders/${order.id}/confirm`);
            toastOk('Natijalar tasdiqlandi' + (res.notifications?.length ? ' va bemorga xabar navbatga qo‘yildi' : ''));
            location.reload();
          } catch (err) { toastError(err); }
        },
      })
    : null;

  const summaryBox = el(`div.card`, {}, [
    el('h3', { text: '🔎 Avtomatik tahlil' }),
    el('p', {}, [
      summary.critical ? el('span.badge.danger', { text: `${summary.critical} ta kritik` }) : null,
      ' ',
      summary.abnormal ? el('span.badge.warn', { text: `${summary.abnormal} ta chetda` }) : null,
    ]),
    el('p', { text: summary.conclusion }),
    summary.notes.length ? el('ul', {}, summary.notes.map((n) => el('li', { text: n }))) : null,
    el('p.small.muted', { text: 'Qoidalarga asoslangan xulosa. Yakuniy qaror shifokor zimmasida.' }),
  ]);

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('div', {}, [
          el('h3', { style: 'margin:0' }, [
            order.order_number, ' ', statusBadge(order.status),
            order.priority === 'urgent' ? el('span.badge.danger', { text: 'CITO' }) : null,
          ]),
          el('div', {}, [
            el('a', { href: `#/patients/${order.patient_id}`, text: fullName(order) }),
            el('span.muted', { text: ` · karta ${order.card_number} · ${fmtDate(order.birth_date)}` }),
          ]),
          order.complaint ? el('div.small.muted', { text: `Shikoyat: ${order.complaint}` }) : null,
        ]),
        el('div.row', {}, [
          el('button', { text: '🖨 Blanka', onclick: () => printReport(order.id) }),
          confirmBtn,
        ]),
      ]),
    ]),
    el('div.card', {}, [
      el('h3', { text: 'Natijalar' }),
      table(['Analiz', 'Qiymat', 'Birlik', 'Norma', 'Baho', 'Kim kiritdi', ''], rows),
      editable
        ? el('div.row', { style: 'margin-top:12px' }, [
            saveBtn,
            el('span.small.muted', { text: 'Har bir o‘zgarish audit jurnaliga eski va yangi qiymati bilan yoziladi.' }),
          ])
        : el('p.small.muted', { text: 'Tahrirlash uchun ruxsat yo‘q yoki natijalar tasdiqlangan.' }),
    ]),
    summaryBox,
  ]);
}

/** Chop etiladigan natija blankasi — alohida oynada. */
async function printReport(orderId) {
  const d = await api.get(`/orders/${orderId}/report`);
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return toastError(new Error('Brauzer yangi oynani bloklab qo‘ydi'));

  const rows = d.items.map((i) => {
    const val = i.value_text ?? i.value_num ?? '—';
    const flag = i.flag && i.flag !== 'normal' ? ` (${i.flag})` : '';
    return `<tr><td>${esc(i.name)}</td><td style="text-align:right">${esc(val)}${flag}</td>
            <td>${esc(i.unit || '')}</td><td>${esc(i.confirmed_by_name || i.entered_by_name || '')}</td></tr>`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html lang="uz"><head><meta charset="utf-8">
    <title>${esc(d.order.order_number)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;color:#111}
      h1{font-size:18px;margin:0 0 4px} .muted{color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
      .sign{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}
    </style></head><body>
    <h1>${esc(state.lab.name)}</h1>
    <div class="muted">Tahlil natijasi · ${esc(d.order.order_number)}</div>
    <hr>
    <div><strong>${esc(`${d.order.last_name} ${d.order.first_name} ${d.order.middle_name || ''}`)}</strong></div>
    <div class="muted">Karta № ${esc(d.order.card_number)} · Tug‘ilgan: ${d.order.birth_date ? new Date(d.order.birth_date).toLocaleDateString('uz-UZ') : '—'} · ${d.age ?? '—'} yosh</div>
    <div class="muted">Sana: ${new Date(d.order.created_at).toLocaleString('uz-UZ')}</div>
    <table><thead><tr><th>Ko‘rsatkich</th><th style="text-align:right">Natija</th><th>Birlik</th><th>Bajardi</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="muted">${esc(d.summary.conclusion)}</p>
    <div class="sign"><span>Laborant: ______________</span><span>Shifokor: ______________</span></div>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Shifokor navbati: tasdiqlangan, lekin xulosasiz buyurtmalar. */
export async function doctorQueueView() {
  const d = await api.get('/visits/doctor-queue');
  return el('div.card', {}, [
    el('h3', { text: 'Xulosa kutayotgan bemorlar' }),
    table(['Bemor', 'Buyurtma', 'Sana', 'Kritik', 'Chetda', ''],
      d.items.length
        ? d.items.map((i) => el('tr', {}, [
            el('td', {}, [el('a', { href: `#/patients/${i.patient_id}`, text: `${i.last_name} ${i.first_name}` })]),
            el('td.mono', {}, [el('a', { href: `#/orders/${i.order_id}`, text: i.order_number })]),
            el('td.small', { text: fmtDate(i.created_at) }),
            el('td', {}, [Number(i.critical_count) ? el('span.badge.danger', { text: i.critical_count }) : el('span.muted', { text: '—' })]),
            el('td', {}, [Number(i.abnormal_count) ? el('span.badge.warn', { text: i.abnormal_count }) : el('span.muted', { text: '—' })]),
            el('td', {}, [el('a.btn.sm', { href: `#/patients/${i.patient_id}`, text: 'Kartani ochish' })]),
          ]))
        : [emptyRow(6, 'Navbat bo‘sh')]),
  ]);
}
