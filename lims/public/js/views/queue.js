import { api } from '../api.js';
import { state } from '../app.js';
import {
  GENDER, age, clear, el, emptyRow, field, fmtDate, fmtDateTime, fullName, modal,
  readForm, table, toast, toastError, toastOk,
} from '../ui.js';

/**
 * Navbat (registratura).
 *
 * Bemor telefon qiladi → xodim ismi, yoshi, telefoni va hududini yozadi,
 * bo'sh vaqtni tanlaydi → tizim navbat raqamini beradi. Vaqt yaqinlashganda
 * ekranda ogohlantirish chiqadi va bemorga SMS navbatga qo'yiladi.
 */

const STATUS = {
  booked: { label: 'Kutilmoqda', cls: '' },
  confirmed: { label: 'Tasdiqlangan', cls: 'info' },
  arrived: { label: 'Keldi', cls: 'ok' },
  done: { label: 'Yakunlandi', cls: 'ok' },
  no_show: { label: 'Kelmadi', cls: 'danger' },
  cancelled: { label: 'Bekor qilingan', cls: 'danger' },
};

const canBook = () => ['admin', 'laborant', 'cashier'].includes(state.user.role);

export async function queueView() {
  const cfg = await api.get('/appointments/config');
  const listBox = el('div');
  const alertBox = el('div');
  const countsBox = el('div.row', { style: 'gap:8px' });
  const date = el('input', { type: 'date', style: 'max-width:170px' });

  let timer = null;
  const stop = () => { if (timer) clearInterval(timer); window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);

  async function load() {
    try {
      const d = await api.get(`/appointments?date=${date.value}`);
      clear(countsBox).append(...[
        chip(`Jami: ${d.counts.total}`),
        chip(`Kutilmoqda: ${d.counts.waiting}`, 'info'),
        chip(`Keldi: ${d.counts.arrived}`, 'ok'),
        d.counts.no_show ? chip(`Kelmadi: ${d.counts.no_show}`, 'danger') : null,
      ].filter(Boolean));

      clear(listBox).append(table(
        ['№', 'Vaqt', 'Bemor', 'Yosh/Jins', 'Telefon', 'Hudud', 'Holat', 'Kim yozdi', ''],
        d.items.length
          ? d.items.map((a) => el('tr', { class: a.status === 'no_show' ? 'flag-low' : '' }, [
              el('td', {}, [el('strong', { text: `№${a.queue_number}` })]),
              el('td.mono', { text: a.time }),
              el('td', {}, [
                a.patient_id
                  ? el('a', { href: `#/patients/${a.patient_id}`, text: `${a.last_name} ${a.first_name}` })
                  : el('span', { text: `${a.last_name} ${a.first_name}` }),
                a.card_number ? el('div.small.muted', { text: `karta ${a.card_number}` }) : null,
                a.note ? el('div.small.muted', { text: a.note }) : null,
                Number(a.past_no_shows) > 1
                  ? el('div', {}, [el('span.badge.warn', { text: `${a.past_no_shows} marta kelmagan` })])
                  : null,
              ]),
              el('td.small', {
                text: `${a.age_years ?? (a.birth_date ? age(a.birth_date) : '—')} / ${GENDER[a.gender] || '—'}`,
              }),
              el('td.small.mono', { text: a.phone }),
              el('td.small', { text: [a.region, a.district].filter(Boolean).join(', ') || '—' }),
              el('td', {}, [el(`span.badge.${STATUS[a.status]?.cls || ''}`, { text: STATUS[a.status]?.label || a.status })]),
              el('td.small', { text: a.created_by_name || '—' }),
              el('td.row', {}, canBook() && ['booked', 'confirmed'].includes(a.status)
                ? [
                    el('button.sm.primary', { text: 'Keldi', onclick: () => arrive(a, load) }),
                    el('button.sm', { text: 'Ko‘chirish', onclick: () => editDialog(a, cfg, load) }),
                    el('button.sm', { text: 'Bekor', onclick: () => cancelDialog(a, load) }),
                  ]
                : a.status === 'arrived' && a.patient_id
                  ? [el('a.btn.sm', { href: `#/patients/${a.patient_id}`, text: 'Kartani ochish' })]
                  : []),
            ]))
          : [emptyRow(9, 'Bu kunga navbat yo‘q')],
      ));
    } catch (err) {
      clear(listBox).append(el('div.error-box', { text: err.message }));
    }
  }

  /** Vaqti yaqinlashgan navbatlar — ekran tepasida ogohlantirish. */
  const seen = new Set();
  async function checkUpcoming(firstRun = false) {
    try {
      const { items } = await api.get('/appointments/upcoming');
      clear(alertBox);
      if (!items.length) return;

      alertBox.append(el('div.card', { style: 'border-left:4px solid var(--warn)' }, [
        el('h3', { text: `⏰ Navbati yaqinlashayotgan bemorlar (${items.length})` }),
        el('div', {}, items.map((i) => el('div.row.between', {
          style: 'padding:6px 0;border-bottom:1px solid var(--border)',
        }, [
          el('div', {}, [
            el('strong', { text: `№${i.queue_number} — ${i.last_name} ${i.first_name}` }),
            el('div.small.muted', { text: `${i.time} · ${i.phone} · ${[i.region, i.district].filter(Boolean).join(', ')}` }),
          ]),
          el('span.badge' + (i.minutes_left <= 5 ? '.danger' : '.warn'), {
            text: i.minutes_left <= 0 ? 'vaqti keldi' : `${i.minutes_left} daqiqa qoldi`,
          }),
        ]))),
      ]));

      // Yangi paydo bo'lganlari uchun bir marta xabarnoma
      if (!firstRun) {
        for (const i of items) {
          if (seen.has(i.id) || i.minutes_left > 15) continue;
          seen.add(i.id);
          toast(`⏰ №${i.queue_number} ${i.last_name} ${i.first_name} — ${i.minutes_left} daqiqadan keyin`, 'ok');
        }
      } else {
        items.forEach((i) => seen.add(i.id));
      }
    } catch { /* tarmoq uzilishi — keyingi urinishda */ }
  }

  // Sana laboratoriya vaqt mintaqasi bo'yicha (brauzernikidan farq qilishi mumkin)
  date.value = cfg.today;
  date.addEventListener('change', load);
  await load();
  await checkUpcoming(true);
  timer = setInterval(() => { checkUpcoming(); load(); }, 30_000);

  return el('div', {}, [
    alertBox,
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('div.row', {}, ['Sana:', date, countsBox]),
        canBook()
          ? el('button.primary', { text: '+ Navbatga yozish', onclick: () => bookDialog(cfg, load, date.value) })
          : null,
      ]),
    ]),
    el('div.card', {}, [listBox]),
  ]);
}

const chip = (text, cls = '') => el(`span.badge.${cls}`, { text });

/** Telefon qilgan bemorni navbatga yozish. */
async function bookDialog(cfg, onDone, initialDate) {
  const search = el('input', { placeholder: 'Telefon yoki ism bo‘yicha qidirish (ixtiyoriy)' });
  const found = el('div');

  const form = el('div.form-grid', {}, [
    field('Familiya *', el('input', { name: 'last_name' })),
    field('Ism *', el('input', { name: 'first_name' })),
    field('Otasining ismi', el('input', { name: 'middle_name' })),
    field('Yoshi', el('input', { name: 'age_years', inputmode: 'numeric', placeholder: '41' })),
    field('Tug‘ilgan sana', el('input', { name: 'birth_date', type: 'date' })),
    field('Jins', el('select', { name: 'gender' }, [
      el('option', { value: 'u', text: 'Tanlanmagan' }),
      el('option', { value: 'm', text: 'Erkak' }),
      el('option', { value: 'f', text: 'Ayol' }),
    ])),
    field('Telefon *', el('input', { name: 'phone', placeholder: '+998 __ ___ __ __' })),
    field('Viloyat', el('select', { name: 'region' }, [
      el('option', { value: '', text: '— tanlang —' }),
      ...cfg.regions.map((r) => el('option', { value: r, text: r })),
    ])),
    field('Tuman/shahar', el('input', { name: 'district' })),
  ]);

  const dateInput = el('input', { type: 'date', value: initialDate || cfg.today });
  const slotBox = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto' });
  const note = el('input', { name: 'note', placeholder: 'masalan: och qoringa keladi' });
  let chosen = null;

  async function loadSlots() {
    chosen = null;
    clear(slotBox).append(el('span.small.muted', { text: 'Yuklanmoqda…' }));
    const { slots } = await api.get(`/appointments/slots?date=${dateInput.value}`);
    const free = slots.filter((s) => s.free).length;
    if (!free) {
      clear(slotBox).append(el('div.small.muted', { text: 'Bu kunda bo‘sh vaqt qolmadi — boshqa sanani tanlang' }));
      return;
    }
    clear(slotBox).append(...slots.map((s) => {
      const btn = el('button.sm', {
        text: `${s.time}${s.past ? ' (o‘tdi)' : s.free ? '' : ' (band)'}`,
        disabled: !s.free,
        title: s.past ? 'Vaqt o‘tib ketgan' : `${s.booked}/${s.capacity} band`,
        onclick: () => {
          chosen = s.time;
          for (const b of slotBox.children) b.className = 'sm';
          btn.className = 'sm primary';
        },
      });
      return btn;
    }));
  }
  dateInput.addEventListener('change', loadSlots);
  await loadSlots();

  // Oldingi murojaatni topib, maydonlarni to'ldirish
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (search.value.trim().length < 3) return clear(found);
      const d = await api.get(`/appointments/lookup?q=${encodeURIComponent(search.value.trim())}`);
      const rows = [
        ...d.patients.map((p) => ({ ...p, source: `karta ${p.card_number}` })),
        ...d.previous.map((p) => ({ ...p, source: 'oldingi navbat' })),
      ];
      clear(found).append(...(rows.length
        ? rows.map((p) => el('div.row', {
            style: 'cursor:pointer;padding:6px;border-bottom:1px solid var(--border)',
            onclick: () => {
              const set = (name, value) => {
                const input = form.querySelector(`[name=${name}]`);
                if (input && value) input.value = String(value).slice(0, 40);
              };
              set('last_name', p.last_name); set('first_name', p.first_name);
              set('middle_name', p.middle_name); set('phone', p.phone);
              set('region', p.region); set('district', p.district);
              set('gender', p.gender);
              if (p.birth_date) set('birth_date', String(p.birth_date).slice(0, 10));
              if (p.age_years) set('age_years', p.age_years);
              form.dataset.patientId = p.id || p.patient_id || '';
              clear(found);
              toastOk('Ma’lumot to‘ldirildi');
            },
          }, [
            el('div', {}, [
              el('div', { text: fullName(p) }),
              el('div.small.muted', { text: `${p.phone || ''} · ${p.source}` }),
            ]),
          ]))
        : [el('div.small.muted', { style: 'padding:6px', text: 'Topilmadi — yangi bemor sifatida yozing' })]));
    }, 300);
  });

  modal({
    title: 'Navbatga yozish',
    wide: true,
    body: el('div', {}, [
      field('Avval murojaat qilganmi?', search),
      found,
      form,
      el('div.form-grid', { style: 'margin-top:8px' }, [
        field('Sana', dateInput),
        field('Izoh', note),
      ]),
      el('label', { text: 'Vaqtni tanlang' }),
      slotBox,
    ]),
    actions: [{
      label: 'Navbatga yozish',
      primary: true,
      onClick: async () => {
        const body = readForm(form);
        if (!body.last_name || !body.first_name || !body.phone) {
          toastError(new Error('Familiya, ism va telefon majburiy'));
          return false;
        }
        if (!chosen) { toastError(new Error('Vaqtni tanlang')); return false; }

        // Tanlangan sana va vaqtni mahalliy vaqt sifatida yuboramiz
        const [hh, mm] = chosen.split(':').map(Number);
        const dt = new Date(`${dateInput.value}T00:00:00`);
        dt.setHours(hh, mm, 0, 0);

        const a = await api.post('/appointments', {
          ...body,
          age_years: body.age_years ? Number(body.age_years) : undefined,
          patient_id: form.dataset.patientId ? Number(form.dataset.patientId) : undefined,
          note: note.value.trim() || undefined,
          scheduled_at: dt.toISOString(),
        });
        toastOk(`Navbat №${a.queue_number} — ${dateInput.value} ${a.time}`);
        onDone?.();
      },
    }],
  });
}

async function arrive(a, onDone) {
  try {
    const r = await api.post(`/appointments/${a.id}/arrive`, {});
    toastOk(r.created_card ? 'Keldi — yangi karta ochildi' : 'Keldi — mavjud karta topildi');
    onDone?.();
    location.hash = `#/patients/${r.patient_id}`;
  } catch (err) { toastError(err); }
}

function cancelDialog(a, onDone) {
  const reason = el('input', { placeholder: 'sabab' });
  modal({
    title: `Navbatni bekor qilish — №${a.queue_number}`,
    body: el('div', {}, [
      el('p', { text: `${a.last_name} ${a.first_name}, ${a.time}` }),
      field('Sabab', reason),
    ]),
    actions: [{
      label: 'Bekor qilish', danger: true,
      onClick: async () => {
        await api.post(`/appointments/${a.id}/cancel`, { reason: reason.value });
        toastOk('Bekor qilindi');
        onDone?.();
      },
    }],
  });
}

async function editDialog(a, cfg, onDone) {
  const dateInput = el('input', { type: 'date', value: String(a.scheduled_date).slice(0, 10) });
  const slotBox = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto' });
  const phone = el('input', { value: a.phone });
  let chosen = null;

  async function loadSlots() {
    clear(slotBox).append(el('span.small.muted', { text: 'Yuklanmoqda…' }));
    const { slots } = await api.get(`/appointments/slots?date=${dateInput.value}`);
    clear(slotBox).append(...slots.map((s) => el('button.sm', {
      text: `${s.time}${s.past ? ' (o‘tdi)' : s.free ? '' : ' (band)'}`,
      disabled: !s.free && s.time !== a.time,
      onclick: (e) => {
        chosen = s.time;
        for (const b of slotBox.children) b.className = 'sm';
        e.currentTarget.className = 'sm primary';
      },
    })));
  }
  dateInput.addEventListener('change', loadSlots);
  await loadSlots();

  modal({
    title: `Navbatni ko‘chirish — №${a.queue_number}`,
    wide: true,
    body: el('div', {}, [
      el('p', { text: `${a.last_name} ${a.first_name}` }),
      field('Telefon', phone),
      field('Yangi sana', dateInput),
      el('label', { text: 'Yangi vaqt' }),
      slotBox,
      el('p.small.muted', { text: 'Vaqt o‘zgarsa, eslatma yangi vaqt bo‘yicha qaytadan yuboriladi.' }),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        const body = { phone: phone.value.trim() };
        if (chosen) {
          const [hh, mm] = chosen.split(':').map(Number);
          const dt = new Date(`${dateInput.value}T00:00:00`);
          dt.setHours(hh, mm, 0, 0);
          body.scheduled_at = dt.toISOString();
        }
        await api.patch(`/appointments/${a.id}`, body);
        toastOk('Saqlandi');
        onDone?.();
      },
    }],
  });
}

/** Hudud statistikasi (administrator uchun). */
export async function queueStatsView() {
  const d = await api.get('/appointments/stats');
  const max = Math.max(...d.byRegion.map((r) => r.c), 1);

  return el('div', {}, [
    el('div.grid.cols-3', { style: 'margin-bottom:16px' }, [
      el('div.stat', {}, [el('div.label', { text: 'Jami navbat' }), el('div.value', { text: d.summary.total })]),
      el('div.stat', {}, [el('div.label', { text: 'Kelgan' }), el('div.value', { text: d.summary.came })]),
      el('div.stat', {}, [
        el('div.label', { text: 'Kelmagan' }),
        el('div.value', { text: d.summary.no_show }),
        el('div.hint', {
          text: d.summary.total ? `${Math.round((d.summary.no_show / d.summary.total) * 100)}%` : '',
        }),
      ]),
    ]),
    el('div.card', {}, [
      el('h3', { text: `Bemorlar qaysi hududdan keladi (${d.from} — ${d.to})` }),
      el('div', {}, d.byRegion.map((r) => el('div.row', { style: 'gap:8px;margin-bottom:4px' }, [
        el('span.small', { style: 'width:150px', text: r.region }),
        el('div', { style: `height:14px;border-radius:4px;background:var(--primary);width:${(r.c / max) * 60 + 2}%` }),
        el('span.small', { text: `${r.c} ta` }),
      ]))),
    ]),
    el('div.card', {}, [
      el('h3', { text: 'Kunlar bo‘yicha' }),
      table(['Sana', 'Navbat', 'Kelmagan'], d.byDay.map((x) => el('tr', {}, [
        el('td.small', { text: fmtDate(x.day) }),
        el('td.num', { text: x.total }),
        el('td.num', {}, [x.no_show ? el('span.badge.warn', { text: x.no_show }) : el('span.muted', { text: '0' })]),
      ]))),
    ]),
  ]);
}
