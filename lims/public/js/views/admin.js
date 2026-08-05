import { api, auth } from '../api.js';
import { state } from '../app.js';
import {
  ACTION_LABEL, ROLE_LABEL, avatar, clear, el, emptyRow, field, fmtDateTime, fmtMoney, fmtTime,
  modal, readForm, table, toastError, toastOk,
} from '../ui.js';
import { changePasswordForm, pinPanel, photoPanel, twoFactorPanel } from './auth.js';

// ---------------------------------------------------------------------------
// Xodimlar
// ---------------------------------------------------------------------------

export async function staffView() {
  const box = el('div');

  async function load() {
    const d = await api.get('/users');
    clear(box).append(table(
      ['', 'Rasm', 'F.I.O.', 'Login', 'Rol', 'Telefon', 'PIN', '2FA', 'Oxirgi kirish', 'Holat', ''],
      d.items.map((u) => el('tr', {}, [
        el('td', {}, [el(`span.dot${u.is_online ? '.online' : ''}`)]),
        el('td', {}, [avatar(u, { size: 36 })]),
        el('td', { text: u.full_name }),
        el('td.mono', { text: u.username }),
        el('td', {}, [el('span.badge.info', { text: ROLE_LABEL[u.role] })]),
        el('td.small', { text: u.phone || '—' }),
        el('td', {}, [
          u.pin_locked
            ? el('span.badge.warn', { text: 'bloklangan' })
            : u.has_pin
              ? el('span.badge.ok', { text: 'qo‘yilgan' })
              : el('span.muted', { text: '—' }),
        ]),
        el('td', {}, [u.totp_enabled ? el('span.badge.ok', { text: 'yoqilgan' }) : el('span.muted', { text: '—' })]),
        el('td.small', { text: u.last_login_at ? fmtDateTime(u.last_login_at) : 'hech qachon' }),
        el('td', {}, [u.is_active ? el('span.badge.ok', { text: 'Faol' }) : el('span.badge', { text: 'Faolsiz' })]),
        el('td.row', {}, [
          el('button.sm', { text: 'Tahrir', onclick: () => editUserDialog(u, load) }),
          el('button.sm', { text: 'Rasm', onclick: () => photoDialog(u, load) }),
          el('button.sm', { text: u.has_pin ? 'PIN tiklash' : 'PIN qo‘yish', onclick: () => pinDialog(u, load) }),
          el('button.sm', { text: 'Parol', onclick: () => resetPasswordDialog(u) }),
          el('button.sm', {
            text: 'Sessiyalarni yopish',
            onclick: async () => {
              try {
                const r = await api.post(`/users/${u.id}/logout-all`, { reason: 'Administrator tomonidan' });
                toastOk(`${r.closed} ta sessiya yopildi`);
                load();
              } catch (err) { toastError(err); }
            },
          }),
        ]),
      ])),
    ));
  }
  await load();

  const kpiBox = el('div.card', {}, [el('div.empty', { text: 'Yuklanmoqda…' })]);
  api.get('/users/kpi').then((k) => clear(kpiBox).append(
    el('h3', { text: `Xodimlar KPI (${k.from} — ${k.to})` }),
    table(['Xodim', 'Rol', 'Kiritilgan natija', 'Tasdiqlangan', 'Yangi bemor', 'Kassa', 'Ish soati'],
      k.items.map((i) => el('tr', {}, [
        el('td', { text: i.full_name }),
        el('td.small', { text: ROLE_LABEL[i.role] }),
        el('td.num', { text: i.results_entered }),
        el('td.num', { text: i.results_confirmed }),
        el('td.num', { text: i.patients_created }),
        el('td.num', { text: fmtMoney(i.cash_collected, state.lab.currency) }),
        el('td.num', { text: i.hours_worked }),
      ]))),
  ));

  return el('div', {}, [
    el('div.row', { style: 'margin-bottom:12px' }, [
      el('button.primary', { text: '+ Yangi xodim', onclick: () => newUserDialog(load) }),
    ]),
    el('div.card', {}, [box]),
    kpiBox,
  ]);
}

function userForm(u = {}) {
  return el('div.form-grid', {}, [
    field('F.I.O. *', el('input', { name: 'full_name', value: u.full_name || '' })),
    !u.id ? field('Login *', el('input', { name: 'username' })) : null,
    !u.id ? field('Parol *', el('input', { name: 'password', type: 'password' })) : null,
    field('Rol *', el('select', { name: 'role' }, Object.entries(ROLE_LABEL).map(([v, t]) =>
      el('option', { value: v, text: t, selected: u.role === v })))),
    field('Telefon', el('input', { name: 'phone', value: u.phone || '' })),
  ]);
}

function newUserDialog(onDone) {
  const form = userForm();
  modal({
    title: 'Yangi xodim',
    body: el('div', {}, [
      form,
      el('p.small.muted', { text: 'Xodim birinchi kirishda parolni almashtirishi so‘raladi.' }),
    ]),
    actions: [{
      label: 'Qo‘shish', primary: true,
      onClick: async () => {
        await api.post('/users', readForm(form));
        toastOk('Xodim qo‘shildi');
        onDone?.();
      },
    }],
  });
}

function editUserDialog(u, onDone) {
  const form = userForm(u);
  const active = el('input', { type: 'checkbox', checked: u.is_active, style: 'width:auto' });
  modal({
    title: `Xodim — ${u.full_name}`,
    body: el('div', {}, [
      form,
      el('label', { style: 'display:flex;gap:8px;align-items:center' }, [active, 'Faol hisob']),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        await api.patch(`/users/${u.id}`, { ...readForm(form), is_active: active.checked });
        toastOk('Saqlandi');
        onDone?.();
      },
    }],
  });
}

/**
 * Xodim rasmi. Rasm ish stansiyasida "hozir kim ishlayapti" ro'yxatida va
 * PIN bilan kirish oynasida ko'rinadi — shuning uchun yuz aniq tushsin.
 */
function photoDialog(u, onDone) {
  const preview = avatar(u, { size: 120 });
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const info = el('p.small.muted', {
    text: 'JPG, PNG yoki WEBP. Eng ko‘pi 5 MB. Kvadrat rasm eng chiroyli ko‘rinadi.',
  });

  file.onchange = () => {
    const f = file.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    clear(preview).append(el('img', { src: url, alt: '' }));
  };

  modal({
    title: `Rasm — ${u.full_name}`,
    body: el('div', { style: 'display:grid;gap:14px;justify-items:center' }, [
      preview,
      file,
      info,
      u.has_photo
        ? el('button.danger.sm', {
            text: 'Rasmni o‘chirish',
            onclick: async () => {
              try {
                await api.del(`/users/${u.id}/photo`);
                toastOk('Rasm o‘chirildi');
                onDone?.();
              } catch (err) { toastError(err); }
            },
          })
        : null,
    ]),
    actions: [{
      label: 'Yuklash', primary: true,
      onClick: async () => {
        const f = file.files?.[0];
        if (!f) throw new Error('Rasm tanlanmadi');
        const fd = new FormData();
        fd.append('photo', f);
        await api.upload(`/users/${u.id}/photo`, fd);
        toastOk('Rasm saqlandi');
        onDone?.();
      },
    }],
  });
}

/**
 * PIN kodni administrator qo'yadi yoki tiklaydi (xodim unutganda).
 * Yangi PIN xodimga og'zaki aytiladi — u keyin Sozlamalarda o'zgartira oladi.
 */
function pinDialog(u, onDone) {
  const pin = el('input', {
    inputmode: 'numeric', maxlength: '8', autocomplete: 'off',
    placeholder: '4–8 raqam',
  });
  modal({
    title: `PIN kod — ${u.full_name}`,
    body: el('div', {}, [
      el('p.small.muted', {
        text: 'PIN bilan xodim kirish oynasida o‘z rasmini bosib, kodni terib kiradi. '
            + 'Ketma-ket (1234) va bir xil (0000) raqamlar qabul qilinmaydi.',
      }),
      field('Yangi PIN', pin),
      u.has_pin
        ? el('button.danger.sm', {
            text: 'PIN kodni o‘chirish',
            onclick: async () => {
              try {
                await api.del(`/users/${u.id}/pin`);
                toastOk('PIN o‘chirildi — xodim endi parol bilan kiradi');
                onDone?.();
              } catch (err) { toastError(err); }
            },
          })
        : null,
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        await api.post(`/users/${u.id}/pin`, { pin: pin.value.trim() });
        toastOk('PIN saqlandi — xodimga aytib qo‘ying');
        onDone?.();
      },
    }],
  });
}

function resetPasswordDialog(u) {
  const pw = el('input', { type: 'password', placeholder: 'kamida 8 belgi' });
  modal({
    title: `Parolni tiklash — ${u.full_name}`,
    body: field('Yangi parol', pw),
    actions: [{
      label: 'Tiklash', danger: true,
      onClick: async () => {
        await api.post(`/users/${u.id}/reset-password`, { password: pw.value });
        toastOk('Parol tiklandi — xodim kirishda almashtiradi');
      },
    }],
  });
}

// ---------------------------------------------------------------------------
// Ish nazorati: sessiyalar, onlayn xodimlar, kunlik lenta
// ---------------------------------------------------------------------------

export async function monitoringView() {
  const online = await api.get('/monitoring/online');
  const sessionsBox = el('div');
  const activityBox = el('div.card', {}, [el('div.empty', { text: 'Sessiyani tanlang — kun davomidagi amallar shu yerda ko‘rinadi' })]);

  async function loadSessions() {
    const d = await api.get('/monitoring/sessions?limit=100');
    clear(sessionsBox).append(table(
      ['', 'Xodim', 'Kompyuter', 'IP', 'Kirdi', 'Oxirgi faollik', 'Soat', 'Amallar', ''],
      d.items.length
        ? d.items.map((s) => el('tr', {}, [
            el('td', {}, [el(`span.dot${s.is_online ? '.online' : ''}`)]),
            el('td', {}, [
              el('div', { text: s.full_name }),
              el('div.small.muted', { text: ROLE_LABEL[s.role] }),
            ]),
            el('td.small.mono', { text: s.computer_name || '—' }),
            el('td.small.mono', { text: s.ip_address || '—' }),
            el('td.small', { text: fmtDateTime(s.login_at) }),
            el('td.small', { text: fmtTime(s.last_seen_at) }),
            el('td.num', { text: s.hours }),
            el('td.num', { text: s.actions }),
            el('td', {}, [el('button.sm', {
              text: 'Lenta',
              onclick: async () => {
                const a = await api.get(`/monitoring/sessions/${s.id}/activity`);
                clear(activityBox).append(
                  el('h3', { text: `${s.full_name} — ${s.computer_name || 'noma’lum kompyuter'}` }),
                  el('div.timeline', {}, a.items.length
                    ? a.items.map((i) => el('div.tl-item', {}, [
                        el('div.tl-time', { text: fmtDateTime(i.at) }),
                        el('div', {}, [
                          el('span.badge.info', { text: ACTION_LABEL[i.action] || i.action }), ' ',
                          i.description || '',
                          i.patient_id ? el('a.small', { href: `#/patients/${i.patient_id}`, text: ` → karta ${i.card_number}` }) : null,
                        ]),
                      ]))
                    : [el('div.empty', { text: 'Amallar yo‘q' })]),
                );
              },
            })]),
          ]))
        : [emptyRow(9)],
    ));
  }
  await loadSessions();

  return el('div', {}, [
    el('div.card', {}, [
      el('h3', { text: `🟢 Hozir ishlayotgan xodimlar (${online.items.length})` }),
      online.items.length
        ? el('div.grid.cols-3', {}, online.items.map((o) => el('div.stat.row', {
            style: 'align-items:flex-start;flex-wrap:nowrap;gap:12px',
          }, [
            avatar(o, { size: 44 }),
            el('div', { style: 'min-width:0' }, [
              el('div.label', {}, [el('span.dot.online'), o.full_name]),
              el('div', { class: 'small', text: `${ROLE_LABEL[o.role]} · ${o.computer_name || '—'}` }),
              el('div.hint', { text: `Kirgan: ${fmtTime(o.login_at)} · oxirgi faollik: ${fmtTime(o.last_seen_at)}` }),
            ]),
          ])))
        : el('div.empty', { text: 'Hozir hech kim tizimda emas' }),
    ]),
    el('div.card', {}, [el('h3', { text: 'Sessiyalar tarixi (kim, qaysi kompyuterdan, qachon)' }), sessionsBox]),
    activityBox,
  ]);
}

// ---------------------------------------------------------------------------
// Audit jurnali
// ---------------------------------------------------------------------------

export async function auditView() {
  const box = el('div');
  const q = el('input', { placeholder: 'Tafsilot bo‘yicha qidirish…', style: 'min-width:220px' });
  const action = el('select', { style: 'max-width:180px' }, [
    el('option', { value: '', text: 'Barcha amallar' }),
    ...Object.entries(ACTION_LABEL).map(([v, t]) => el('option', { value: v, text: t })),
  ]);
  const computer = el('input', { placeholder: 'Kompyuter nomi…', style: 'max-width:180px' });
  const from = el('input', { type: 'date', style: 'max-width:150px' });
  const to = el('input', { type: 'date', style: 'max-width:150px' });
  const changesOnly = el('input', { type: 'checkbox', style: 'width:auto' });

  async function load() {
    clear(box).append(el('div.empty', { text: 'Yuklanmoqda…' }));
    const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (action.value) p.set('action', action.value);
    if (computer.value.trim()) p.set('computer', computer.value.trim());
    if (from.value) p.set('from', from.value);
    if (to.value) p.set('to', to.value);
    if (changesOnly.checked) p.set('changes_only', '1');

    try {
      const d = await api.get('/monitoring/audit?' + p);
      clear(box).append(table(
        ['Vaqt', 'Xodim', 'Amal', 'Bemor', 'Kompyuter', 'Tafsilot', 'O‘zgarish'],
        d.items.length
          ? d.items.map((a) => el('tr', {}, [
              el('td.small', { text: fmtDateTime(a.at) }),
              el('td.small', { text: a.user_name || '—' }),
              el('td', {}, [el('span.badge' + (a.action === 'ACCESS_DENIED' || a.action === 'LOGIN_FAILED' ? '.danger' : ''), {
                text: ACTION_LABEL[a.action] || a.action,
              })]),
              el('td.small', {}, [a.patient_id
                ? el('a', { href: `#/patients/${a.patient_id}`, text: `${a.patient_last_name} ${a.patient_first_name}` })
                : el('span.muted', { text: '—' })]),
              el('td.small.mono', { text: a.computer_name || '—' }),
              el('td.small', { text: a.description || '' }),
              el('td.small', {}, [a.new_data
                ? el('button.sm', { text: 'Ko‘rish', onclick: () => showDiff(a) })
                : el('span.muted', { text: '—' })]),
            ]))
          : [emptyRow(7, 'Yozuv topilmadi')],
      ));
    } catch (err) {
      clear(box).append(el('div.error-box', { text: err.message }));
    }
  }

  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  for (const c of [action, computer, from, to, changesOnly]) c.addEventListener('change', load);
  load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row', {}, [
        q, action, computer, from, to,
        el('label', { style: 'display:flex;gap:6px;align-items:center;margin:0' }, [changesOnly, 'Faqat o‘zgarishlar']),
      ]),
      el('p.small.muted', { style: 'margin:8px 0 0', text: 'Audit yozuvlari o‘zgartirilmaydi va o‘chirilmaydi — bu bazada trigger bilan ta’minlangan.' }),
    ]),
    el('div.card', {}, [box]),
  ]);
}

function showDiff(a) {
  const fields = [...new Set([...Object.keys(a.old_data || {}), ...Object.keys(a.new_data || {})])];
  modal({
    title: `${ACTION_LABEL[a.action] || a.action} — ${a.user_name || '—'}`,
    body: el('div', {}, [
      el('p.small.muted', { text: `${fmtDateTime(a.at)} · ${a.computer_name || '—'} · ${a.ip_address || ''}` }),
      el('p', { text: a.description || '' }),
      table(['Maydon', 'Eski qiymat', 'Yangi qiymat'], fields.map((f) => el('tr', {}, [
        el('td', { text: f }),
        el('td', {}, [a.old_data?.[f] !== undefined && a.old_data?.[f] !== null
          ? el('span.diff-old', { text: String(a.old_data[f]) }) : el('span.muted', { text: '—' })]),
        el('td', {}, [a.new_data?.[f] !== undefined && a.new_data?.[f] !== null
          ? el('span.diff-new', { text: String(a.new_data[f]) }) : el('span.muted', { text: '—' })]),
      ]))),
    ]),
  });
}

// ---------------------------------------------------------------------------
// Analiz katalogi
// ---------------------------------------------------------------------------

export async function catalogView() {
  const box = el('div');

  async function load() {
    const d = await api.get('/catalog/tests?all=1');
    clear(box).append(table(
      ['Kod', 'Nomi', 'Kategoriya', 'Birlik', 'Narx', 'Muddat', 'Normalar', 'Holat', ''],
      d.items.map((t) => el('tr', {}, [
        el('td.mono', { text: t.code }),
        el('td', { text: t.name }),
        el('td.small', { text: t.category }),
        el('td.small', { text: t.unit || '—' }),
        el('td.num', { text: fmtMoney(t.price, state.lab.currency) }),
        el('td.small', { text: `${t.turnaround_h} soat` }),
        el('td.small', { text: (t.ranges || []).map((r) => `${r.gender === 'u' ? '' : r.gender + ': '}${r.low ?? '—'}–${r.high ?? '—'}`).join('; ') || '—' }),
        el('td', {}, [t.is_active ? el('span.badge.ok', { text: 'Faol' }) : el('span.badge', { text: 'O‘chiq' })]),
        el('td', {}, [el('button.sm', { text: 'Tahrir', onclick: () => editTestDialog(t, load) })]),
      ])),
    ));
  }
  await load();

  return el('div', {}, [
    el('div.row', { style: 'margin-bottom:12px' }, [
      el('button.primary', { text: '+ Analiz qo‘shish', onclick: () => newTestDialog(load) }),
    ]),
    el('div.card', {}, [box]),
  ]);
}

function newTestDialog(onDone) {
  const form = el('div.form-grid', {}, [
    field('Kod *', el('input', { name: 'code', placeholder: 'HGB' })),
    field('Nomi *', el('input', { name: 'name' })),
    field('Kategoriya', el('input', { name: 'category', value: 'Umumiy' })),
    field('Birlik', el('input', { name: 'unit' })),
    field('Narx', el('input', { name: 'price', inputmode: 'numeric', value: '0' })),
    field('Muddat (soat)', el('input', { name: 'turnaround_h', inputmode: 'numeric', value: '24' })),
  ]);
  const low = el('input', { inputmode: 'decimal' });
  const high = el('input', { inputmode: 'decimal' });
  const cLow = el('input', { inputmode: 'decimal' });
  const cHigh = el('input', { inputmode: 'decimal' });

  modal({
    title: 'Yangi analiz',
    body: el('div', {}, [
      form,
      el('h3', { style: 'margin-top:16px', text: 'Norma oralig‘i (barcha jinslar uchun)' }),
      el('div.form-grid', {}, [
        field('Past chegara', low), field('Yuqori chegara', high),
        field('Kritik past', cLow), field('Kritik yuqori', cHigh),
      ]),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        const t = await api.post('/catalog/tests', readForm(form));
        if (low.value || high.value || cLow.value || cHigh.value) {
          await api.post(`/catalog/tests/${t.id}/ranges`, {
            low: low.value, high: high.value, critical_low: cLow.value, critical_high: cHigh.value,
          });
        }
        toastOk('Analiz qo‘shildi');
        onDone?.();
      },
    }],
  });
}

function editTestDialog(t, onDone) {
  const form = el('div.form-grid', {}, [
    field('Nomi', el('input', { name: 'name', value: t.name })),
    field('Kategoriya', el('input', { name: 'category', value: t.category })),
    field('Birlik', el('input', { name: 'unit', value: t.unit || '' })),
    field('Narx', el('input', { name: 'price', value: t.price })),
    field('Muddat (soat)', el('input', { name: 'turnaround_h', value: t.turnaround_h })),
  ]);
  const active = el('input', { type: 'checkbox', checked: t.is_active, style: 'width:auto' });

  modal({
    title: `${t.name} (${t.code})`,
    body: el('div', {}, [
      form,
      el('label', { style: 'display:flex;gap:8px;align-items:center' }, [active, 'Katalogda faol']),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        await api.patch(`/catalog/tests/${t.id}`, { ...readForm(form), is_active: active.checked });
        toastOk('Saqlandi');
        onDone?.();
      },
    }],
  });
}

// ---------------------------------------------------------------------------
// Ombor
// ---------------------------------------------------------------------------

export async function inventoryView() {
  const box = el('div');

  async function load() {
    const d = await api.get('/inventory');
    clear(box).append(table(
      ['Nomi', 'Qoldiq', 'Minimal', 'Yaroqlilik', 'Ta’minotchi', ''],
      d.items.length
        ? d.items.map((i) => el('tr', {}, [
            el('td', {}, [
              i.name,
              i.low_stock ? el('span.badge.warn', { text: 'kam qoldi' }) : null,
              i.expired ? el('span.badge.danger', { text: 'muddati tugagan' }) : null,
              i.expiring_soon && !i.expired ? el('span.badge.warn', { text: 'muddati yaqin' }) : null,
            ]),
            el('td.num', { text: `${i.quantity} ${i.unit}` }),
            el('td.num.small', { text: i.min_quantity }),
            el('td.small', { text: i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('uz-UZ') : '—' }),
            el('td.small', { text: i.supplier || '—' }),
            el('td', {}, [el('button.sm', { text: 'Kirim/Chiqim', onclick: () => moveDialog(i, load) })]),
          ]))
        : [emptyRow(6, 'Ombor bo‘sh')],
    ));
  }
  await load();

  const addBtn = state.user.role === 'admin'
    ? el('button.primary', { text: '+ Pozitsiya qo‘shish', onclick: () => newItemDialog(load) })
    : null;

  return el('div', {}, [
    addBtn ? el('div.row', { style: 'margin-bottom:12px' }, [addBtn]) : null,
    el('div.card', {}, [box]),
  ]);
}

function newItemDialog(onDone) {
  const form = el('div.form-grid', {}, [
    field('Nomi *', el('input', { name: 'name' })),
    field('Birlik', el('input', { name: 'unit', value: 'dona' })),
    field('Boshlang‘ich qoldiq', el('input', { name: 'quantity', value: '0' })),
    field('Minimal qoldiq', el('input', { name: 'min_quantity', value: '0' })),
    field('Yaroqlilik muddati', el('input', { name: 'expiry_date', type: 'date' })),
    field('Ta’minotchi', el('input', { name: 'supplier' })),
  ]);
  modal({
    title: 'Yangi pozitsiya',
    body: form,
    actions: [{
      label: 'Qo‘shish', primary: true,
      onClick: async () => { await api.post('/inventory', readForm(form)); toastOk('Qo‘shildi'); onDone?.(); },
    }],
  });
}

function moveDialog(item, onDone) {
  const delta = el('input', { inputmode: 'decimal', placeholder: 'masalan: -5 yoki 20' });
  const reason = el('input', { placeholder: 'sabab' });
  modal({
    title: `${item.name} — kirim/chiqim`,
    body: el('div', {}, [
      el('p.small.muted', { text: `Joriy qoldiq: ${item.quantity} ${item.unit}` }),
      field('Miqdor (+ kirim, − chiqim)', delta),
      field('Sabab', reason),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        await api.post(`/inventory/${item.id}/move`, { delta: Number(delta.value), reason: reason.value });
        toastOk('Saqlandi');
        onDone?.();
      },
    }],
  });
}

// ---------------------------------------------------------------------------
// Sozlamalar
// ---------------------------------------------------------------------------

export async function settingsView() {
  const station = el('input', {
    value: auth.computerName,
    placeholder: 'masalan: LAB-PC-02',
    disabled: auth.isDesktop,
  });

  return el('div.grid.cols-2', {}, [
    el('div.card', {}, [
      el('h3', { text: 'Ish stansiyasi' }),
      el('p.small.muted', { text: 'Bu nom audit jurnalida va sessiyalar ro‘yxatida ko‘rinadi.' }),
      field('Kompyuter nomi', station),
      auth.isDesktop
        ? el('p.small.muted', {
            text: 'Windows dasturida bu nom kompyuterning tizim nomidan olinadi va o‘zgartirilmaydi.',
          })
        : el('button.primary', {
            text: 'Saqlash',
            onclick: () => { auth.computerName = station.value.trim(); toastOk('Saqlandi'); },
          }),
    ]),
    el('div.card', {}, [el('h3', { text: 'Mening rasmim' }), photoPanel(state.user)]),
    el('div.card', {}, [el('h3', { text: 'Parolni o‘zgartirish' }), changePasswordForm()]),
    el('div.card', {}, [el('h3', { text: 'PIN kod bilan kirish' }), pinPanel(state.user)]),
    el('div.card', {}, [el('h3', { text: 'Ikki bosqichli login' }), twoFactorPanel(state.user)]),
    el('div.card', {}, [
      el('h3', { text: 'Tizim haqida' }),
      el('p.small', {}, [
        `Laboratoriya: ${state.lab.name}`, el('br'),
        `Foydalanuvchi: ${state.user.full_name} (${ROLE_LABEL[state.user.role]})`, el('br'),
        'LabCore LIMS — lokal serverda ishlaydigan laboratoriya boshqaruv tizimi.',
      ]),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Laboratoriya uskunalari (analizatorlar)
// ---------------------------------------------------------------------------

const PROTOCOL_LABEL = {
  hl7: 'HL7 (TCP)', astm: 'ASTM (TCP)', folder: 'Papka', http: 'HTTP (kalit bilan)',
};

export async function devicesView() {
  const box = el('div');

  async function load() {
    const d = await api.get('/devices');
    clear(box).append(table(
      ['Nomi', 'Protokol', 'Ulanish', 'Bog‘langan kodlar', '24 soatda xabar', 'Oxirgi aloqa', 'Holat', ''],
      d.items.length
        ? d.items.map((v) => el('tr', {}, [
            el('td', { text: v.name }),
            el('td', {}, [el('span.badge.info', { text: PROTOCOL_LABEL[v.protocol] || v.protocol })]),
            el('td.small.mono', {
              text: v.protocol === 'folder' ? (v.folder || '—')
                : v.protocol === 'http' ? 'POST /api/devices/intake'
                : `${v.host || '0.0.0.0'}:${v.port ?? '—'}`,
            }),
            el('td.num', { text: v.mappings }),
            el('td.num', { text: v.messages_24h }),
            el('td.small', { text: v.last_seen_at ? fmtDateTime(v.last_seen_at) : 'hech qachon' }),
            el('td', {}, [v.is_active ? el('span.badge.ok', { text: 'Faol' }) : el('span.badge', { text: 'O‘chiq' })]),
            el('td.row', {}, [
              el('button.sm', { text: 'Kodlar', onclick: () => mappingsDialog(v) }),
              el('button.sm', { text: 'Xabarlar', onclick: () => messagesDialog(v) }),
              el('button.sm', { text: 'Sinov', onclick: () => simulateDialog(v) }),
              v.api_token
                ? el('button.sm', { text: 'Kalit', onclick: () => tokenDialog(v) })
                : null,
            ]),
          ]))
        : [emptyRow(8, 'Uskuna qo‘shilmagan')],
    ));
  }
  await load();

  return el('div', {}, [
    el('div.card', {}, [
      el('h3', { text: 'Uskunadan natija qanday keladi' }),
      el('p.small.muted', {
        text: 'Analizator natijani yuboradi → tizim uni shtrix-kod bo‘yicha buyurtmaga bog‘laydi → '
            + 'natija "uskunadan keldi" belgisi bilan laborant ekranida turadi. Bemorga faqat '
            + 'laborant tasdiqlagandan keyin chiqadi. Uskuna odam kiritgan qiymatni bosib ketmaydi.',
      }),
      el('div.row', {}, [
        el('button.primary', { text: '+ Uskuna qo‘shish', onclick: () => newDeviceDialog(load) }),
      ]),
    ]),
    el('div.card', {}, [box]),
  ]);
}

function newDeviceDialog(onDone) {
  const name = el('input', { placeholder: 'masalan: Mindray BC-20' });
  const protocol = el('select', {}, Object.entries(PROTOCOL_LABEL).map(([v, t]) =>
    el('option', { value: v, text: t })));
  const host = el('input', { value: '0.0.0.0' });
  const port = el('input', { inputmode: 'numeric', placeholder: '5100' });
  const folder = el('input', { placeholder: 'C:\\Analizator\\Natijalar' });

  const tcpFields = el('div.form-grid', {}, [field('Tinglash manzili', host), field('Port', port)]);
  const folderField = field('Kuzatiladigan papka', folder);
  folderField.style.display = 'none';

  protocol.addEventListener('change', () => {
    const isFolder = protocol.value === 'folder';
    const isTcp = protocol.value === 'hl7' || protocol.value === 'astm';
    folderField.style.display = isFolder ? '' : 'none';
    tcpFields.style.display = isTcp ? '' : 'none';
  });

  modal({
    title: 'Yangi uskuna',
    body: el('div', {}, [
      field('Nomi', name),
      field('Ulanish turi', protocol),
      tcpFields,
      folderField,
      el('p.small.muted', {
        text: 'HL7/ASTM — uskuna tarmoq orqali yuboradi. Papka — uskuna faylga yozadi. '
            + 'HTTP — vositachi dastur kalit bilan yuboradi.',
      }),
    ]),
    actions: [{
      label: 'Qo‘shish', primary: true,
      onClick: async () => {
        const d = await api.post('/devices', {
          name: name.value.trim(),
          protocol: protocol.value,
          host: host.value.trim() || null,
          port: port.value ? Number(port.value) : null,
          folder: folder.value.trim() || null,
        });
        toastOk(d.api_token ? `Qo‘shildi. Kalit: ${d.api_token}` : 'Uskuna qo‘shildi');
        onDone?.();
      },
    }],
  });
}

/** Uskuna kodlarini katalogdagi analizlarga bog'lash. */
async function mappingsDialog(device) {
  const [{ items: tests }, { items: maps }] = await Promise.all([
    api.get('/catalog/tests'),
    api.get(`/devices/${device.id}/mappings`),
  ]);

  const list = el('div');
  const draw = (rows) => clear(list).append(table(
    ['Uskuna kodi', 'Katalogdagi analiz', 'Koeffitsiyent', ''],
    rows.length
      ? rows.map((m) => el('tr', {}, [
          el('td.mono', { text: m.device_code }),
          el('td', { text: `${m.test_name} (${m.test_code})` }),
          el('td.num', { text: m.factor }),
          el('td', {}, [el('button.sm', {
            text: 'O‘chirish',
            onclick: async () => {
              await api.del(`/devices/mappings/${m.id}`);
              draw((await api.get(`/devices/${device.id}/mappings`)).items);
            },
          })]),
        ]))
      : [emptyRow(4, 'Bog‘lanish yo‘q — uskuna kodi katalog kodiga teng deb olinadi')],
  ));
  draw(maps);

  const code = el('input', { placeholder: 'HB-01' });
  const testSel = el('select', {}, tests.map((t) => el('option', { value: t.id, text: `${t.name} (${t.code})` })));
  const factor = el('input', { value: '1', inputmode: 'decimal' });

  modal({
    title: `${device.name} — kodlar jadvali`,
    wide: true,
    body: el('div', {}, [
      el('p.small.muted', {
        text: 'Uskuna o‘z kodini yuboradi (masalan HB-01), biz uni katalogdagi analizga bog‘laymiz. '
            + 'Koeffitsiyent birlik farqi uchun: g/dL → g/L bo‘lsa 10.',
      }),
      list,
      el('div.form-grid', { style: 'margin-top:12px' }, [
        field('Uskuna kodi', code), field('Analiz', testSel), field('Koeffitsiyent', factor),
      ]),
      el('button.primary', {
        text: 'Bog‘lash',
        onclick: async () => {
          try {
            await api.post(`/devices/${device.id}/mappings`, {
              device_code: code.value.trim(),
              test_id: Number(testSel.value),
              factor: Number(factor.value) || 1,
            });
            code.value = '';
            draw((await api.get(`/devices/${device.id}/mappings`)).items);
            toastOk('Bog‘landi');
          } catch (err) { toastError(err); }
        },
      }),
    ]),
  });
}

/** Uskunadan kelgan xom xabarlar — nosozlikni topish uchun. */
async function messagesDialog(device) {
  const { items } = await api.get(`/devices/${device.id}/messages`);
  const badge = { applied: 'ok', partial: 'warn', failed: 'danger', ignored: '', pending: '' };

  modal({
    title: `${device.name} — kelgan xabarlar`,
    wide: true,
    body: items.length
      ? el('div', {}, items.map((m) => el('div.card', {}, [
          el('div.row.between', {}, [
            el('span.small.muted', { text: fmtDateTime(m.received_at) }),
            el(`span.badge.${badge[m.status] || ''}`, { text: `${m.status} · ${m.applied_count} ta natija` }),
          ]),
          m.error ? el('div.error-box', { text: m.error }) : null,
          el('pre.small.mono', {
            style: 'white-space:pre-wrap;overflow-x:auto;margin:6px 0 0',
            text: m.raw,
          }),
        ])))
      : el('div.empty', { text: 'Xabar kelmagan' }),
  });
}

/** Uskuna yuboradigan xabarni qo'lda kiritib sinash. */
function simulateDialog(device) {
  const raw = el('textarea', {
    rows: '6',
    placeholder: 'SHTRIXKOD,HGB,130,g/L\n\nyoki HL7/ASTM xabarini to‘liq joylashtiring',
  });
  const out = el('div');

  modal({
    title: `${device.name} — sinov`,
    wide: true,
    body: el('div', {}, [
      el('p.small.muted', {
        text: 'Uskunani ulashdan oldin tekshirish uchun: probirka shtrix-kodini va qiymatni kiriting. '
            + 'Natija haqiqiy buyurtmaga yoziladi.',
      }),
      field('Xabar', raw),
      out,
    ]),
    actions: [{
      label: 'Yuborish', primary: true,
      onClick: async () => {
        const res = await api.post(`/devices/${device.id}/simulate`, { raw: raw.value });
        clear(out).append(
          el('div.card', {}, [
            el('div', { text: `Qabul qilindi: ${res.applied.length} ta` }),
            ...res.skipped.map((s) => el('div.small.muted', { text: `${s.code}: ${s.reason}` })),
          ]),
        );
        return false; // oyna ochiq qolsin — natija ko'rinsin
      },
    }],
  });
}

function tokenDialog(device) {
  modal({
    title: `${device.name} — kalit`,
    body: el('div', {}, [
      el('p.small.muted', { text: 'Vositachi dastur shu kalit bilan natija yuboradi:' }),
      el('pre.small.mono', {
        style: 'white-space:pre-wrap',
        text: `POST http://<server>:4000/api/devices/intake\nX-Device-Token: ${device.api_token}\n\n<shtrix-kod>,<kod>,<qiymat>,<birlik>`,
      }),
    ]),
    actions: [{
      label: 'Yangi kalit yaratish', danger: true,
      onClick: async () => {
        const r = await api.post(`/devices/${device.id}/token`);
        toastOk(`Yangi kalit: ${r.token}`);
      },
    }],
  });
}
