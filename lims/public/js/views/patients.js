import { api } from '../api.js';
import { state } from '../app.js';
import {
  GENDER, age, clear, el, emptyRow, field, flagBadge, fmtDate, fmtDateTime, fmtMoney,
  fmtSize, fullName, modal, readForm, statusBadge, table, toastError, toastOk,
} from '../ui.js';

const canEdit = () => ['admin', 'laborant', 'doctor'].includes(state.user.role);

/** Bemorlar ro'yxati va qidiruv (ism, familiya, telefon, karta, tug'ilgan sana). */
export async function patientsView() {
  const results = el('div');
  const search = el('input', { placeholder: 'Ism, familiya, telefon yoki karta raqami…', autofocus: 'true' });
  const birth = el('input', { type: 'date', style: 'max-width:170px' });

  async function load() {
    clear(results).append(el('div.empty', { text: 'Qidirilmoqda…' }));
    try {
      const q = new URLSearchParams();
      if (search.value.trim()) q.set('q', search.value.trim());
      if (birth.value) q.set('birth_date', birth.value);
      const data = await api.get('/patients?' + q);

      clear(results).append(
        el('div.small.muted', { style: 'margin-bottom:8px', text: `Topildi: ${data.total} ta` }),
        table(
          ['Karta', 'F.I.O.', 'Tug‘ilgan', 'Yosh', 'Jins', 'Telefon', 'Analizlar', 'Oxirgi tashrif'],
          data.items.length
            ? data.items.map((p) =>
                el('tr.clickable', { onclick: () => (location.hash = `#/patients/${p.id}`) }, [
                  el('td.mono', { text: p.card_number }),
                  el('td', { text: fullName(p) }),
                  el('td', { text: fmtDate(p.birth_date) }),
                  el('td.num', { text: age(p.birth_date) ?? '—' }),
                  el('td', { text: GENDER[p.gender] || '—' }),
                  el('td', { text: p.phone || '—' }),
                  el('td.num', { text: p.orders_count }),
                  el('td', { text: p.last_order_at ? fmtDate(p.last_order_at) : '—' }),
                ]))
            : [emptyRow(8, 'Bemor topilmadi')],
        ),
      );
    } catch (err) {
      clear(results).append(el('div.error-box', { text: err.message }));
    }
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  birth.addEventListener('change', load);
  load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row', {}, [
        el('div', { style: 'flex:1;min-width:240px' }, [search]),
        birth,
        canEdit() ? el('button.primary', { text: '+ Yangi bemor', onclick: () => newPatientDialog(load) }) : null,
      ]),
    ]),
    el('div.card', {}, [results]),
  ]);
}

function newPatientDialog(onDone) {
  // 409 (ehtimoliy takrorlanish) qaytsa shu belgi ko'rinadi va tasdiqlash imkonini beradi.
  const dupWarning = el('div.error-box');
  dupWarning.style.display = 'none';
  const dupAllow = el('input', { type: 'checkbox', style: 'width:auto' });

  const form = el('div.form-grid', {}, [
    field('Familiya *', el('input', { name: 'last_name' })),
    field('Ism *', el('input', { name: 'first_name' })),
    field('Otasining ismi', el('input', { name: 'middle_name' })),
    field('Tug‘ilgan sana', el('input', { name: 'birth_date', type: 'date' })),
    field('Jins', el('select', { name: 'gender' }, [
      el('option', { value: 'u', text: 'Tanlanmagan' }),
      el('option', { value: 'm', text: 'Erkak' }),
      el('option', { value: 'f', text: 'Ayol' }),
    ])),
    field('Telefon', el('input', { name: 'phone', placeholder: '+998…' })),
    field('Manzil', el('input', { name: 'address' })),
    field('Pasport (ixtiyoriy)', el('input', { name: 'passport' })),
  ]);

  modal({
    title: 'Yangi bemor kartasi',
    body: el('div', {}, [
      dupWarning,
      form,
      el('p.small.muted', { text: 'Karta raqami avtomatik beriladi.' }),
    ]),
    actions: [{
      label: 'Saqlash',
      primary: true,
      onClick: async () => {
        const body = readForm(form);
        if (!body.last_name || !body.first_name) { toastError(new Error('Familiya va ism majburiy')); return false; }
        try {
          const p = await api.post('/patients', { ...body, allow_duplicate: dupAllow.checked });
          toastOk(`Karta yaratildi: ${p.card_number}`);
          onDone?.();
          location.hash = `#/patients/${p.id}`;
        } catch (err) {
          if (err.status === 409) {
            // Takrorlanish ehtimoli — xodim ko'rib chiqib tasdiqlasin
            dupWarning.style.display = '';
            dupWarning.replaceChildren(
              el('div', { text: err.message }),
              el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:6px;color:inherit' }, [
                dupAllow, 'Baribir yangi karta ochilsin',
              ]),
            );
            return false;
          }
          throw err;
        }
      },
    }],
  });
}

/** Bemor kartasi: shaxsiy ma'lumot + 100 yillik tarix. */
export async function patientCardView(id) {
  const [p, h] = await Promise.all([api.get(`/patients/${id}`), api.get(`/patients/${id}/history`)]);

  const tabs = [
    ['Tarix', () => timelineTab(h)],
    ['Analizlar', () => ordersTab(h)],
    ['Tashxis va davolash', () => diagnosesTab(p, h)],
    ['Fayllar', () => filesTab(p, h)],
  ];
  if (['admin', 'cashier'].includes(state.user.role)) tabs.push(["To'lovlar", () => paymentsTab(h)]);
  if (state.user.role === 'admin') tabs.push(['Audit', () => auditTab(p)]);

  const body = el('div');
  const tabBar = el('div.row', { style: 'margin-bottom:12px' }, tabs.map(([label, build], i) =>
    el('button' + (i === 0 ? '.primary' : ''), {
      text: label,
      onclick: (e) => {
        for (const b of tabBar.children) b.className = '';
        e.currentTarget.className = 'primary';
        clear(body).append(build());
      },
    })));
  clear(body).append(tabs[0][1]());

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('div', {}, [
          el('h3', { style: 'margin:0', text: fullName(p) }),
          el('div.small.muted', {
            text: `Karta № ${p.card_number} · ${fmtDate(p.birth_date)} (${age(p.birth_date) ?? '—'} yosh) · ${GENDER[p.gender]}`,
          }),
        ]),
        el('div.row', {}, [
          el('img', { src: `/api/labels/qr/patient/${p.id}`, width: '64', height: '64', alt: 'QR' }),
          canEdit() ? el('button', { text: 'Tahrirlash', onclick: () => editPatientDialog(p) }) : null,
          canEdit() ? el('button.primary', { text: '+ Analiz buyurtmasi', onclick: () => newOrderDialog(p) }) : null,
        ]),
      ]),
      el('div.grid.cols-4', { style: 'margin-top:12px' }, [
        info('Telefon', p.phone), info('Manzil', p.address),
        info('Ro‘yxatga oldi', p.created_by_name), info('Karta ochilgan', fmtDate(p.created_at)),
      ]),
    ]),
    tabBar,
    body,
  ]);
}

const info = (label, value) => el('div', {}, [
  el('label', { text: label }), el('div', { text: value || '—' }),
]);

function timelineTab(h) {
  if (!h.years.length) return el('div.card', {}, [el('div.empty', { text: 'Hozircha yozuvlar yo‘q' })]);
  return el('div.card', {}, [
    el('div.timeline', {}, h.years.flatMap((y) => [
      el('div.year', { text: y.year }),
      ...y.events
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .map((ev) => el('div.tl-item', {}, [
          el('div.tl-time', { text: fmtDateTime(ev.at) }),
          el('div', {}, [
            el('span.badge.info', { text: kindLabel(ev.kind) }), ' ',
            ev.kind === 'order'
              ? el('a', { href: `#/orders/${ev.ref}`, text: ev.title })
              : el('span', { text: ev.title }),
          ]),
        ])),
    ])),
  ]);
}

const kindLabel = (k) => ({ visit: 'Murojaat', order: 'Analiz', diagnosis: 'Tashxis', file: 'Hujjat', payment: 'To‘lov' }[k] || k);

function ordersTab(h) {
  if (!h.orders.length) return el('div.card', {}, [el('div.empty', { text: 'Analizlar yo‘q' })]);
  return el('div', {}, h.orders.map((o) =>
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('div', {}, [
          el('strong', {}, [el('a', { href: `#/orders/${o.id}`, text: o.order_number })]),
          el('div.small.muted', { text: `${fmtDateTime(o.created_at)} · ${o.created_by_name || '—'}` }),
        ]),
        statusBadge(o.status),
      ]),
      table(['Analiz', 'Natija', 'Holat', 'Kiritdi', 'Tasdiqladi'],
        (o.results || []).map((r) => el('tr', { class: r.flag ? `flag-${r.flag}` : '' }, [
          el('td', { text: r.test }),
          el('td.mono', { text: r.value ? `${r.value} ${r.unit || ''}` : '—' }),
          el('td', {}, [flagBadge(r.flag)]),
          el('td.small', { text: r.entered_by || '—' }),
          el('td.small', { text: r.confirmed_by || '—' }),
        ]))),
    ])));
}

function diagnosesTab(p, h) {
  const list = h.diagnoses.length
    ? h.diagnoses.map((d) => el('div.card', {}, [
        el('div.row.between', {}, [
          el('strong', { text: d.diagnosis }),
          el('span.small.muted', { text: `${d.doctor_name} · ${fmtDateTime(d.created_at)}` }),
        ]),
        d.recommendation ? el('div', {}, [el('label', { text: 'Tavsiya' }), d.recommendation]) : null,
        d.medication ? el('div', {}, [el('label', { text: 'Dori' }), d.medication]) : null,
        d.procedure ? el('div', {}, [el('label', { text: 'Muolaja' }), d.procedure]) : null,
        d.follow_up_date ? el('div.small', { text: `Qayta ko‘rik: ${fmtDate(d.follow_up_date)}` }) : null,
      ]))
    : [el('div.card', {}, [el('div.empty', { text: 'Tashxis yozilmagan' })])];

  const addBtn = ['admin', 'doctor'].includes(state.user.role)
    ? el('button.primary', { style: 'margin-bottom:12px', text: '+ Tashxis yozish', onclick: () => diagnosisDialog(p) })
    : null;

  return el('div', {}, [addBtn, ...list]);
}

function diagnosisDialog(p) {
  const form = el('div', {}, [
    field('Tashxis *', el('input', { name: 'diagnosis' })),
    field('Tavsiya', el('textarea', { name: 'recommendation', rows: '2' })),
    field('Dori vositalari', el('textarea', { name: 'medication', rows: '2' })),
    field('Muolaja', el('input', { name: 'procedure' })),
    field('Qayta ko‘rik sanasi', el('input', { name: 'follow_up_date', type: 'date' })),
  ]);
  modal({
    title: `Tashxis — ${fullName(p)}`,
    body: form,
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        const body = readForm(form);
        if (!body.diagnosis) { toastError(new Error('Tashxis matni majburiy')); return false; }
        await api.post('/visits/diagnoses', { ...body, patient_id: p.id });
        toastOk('Tashxis saqlandi');
        location.reload();
      },
    }],
  });
}

function filesTab(p, h) {
  const listBox = el('div');

  const draw = (items) => clear(listBox).append(table(
    ['Yil', 'Turi', 'Nomi', 'Hajmi', 'Yuklangan'],
    items.length
      ? items.map((f) => el('tr', {}, [
          el('td', { text: f.year }),
          el('td', {}, [el('span.badge', { text: fileCat(f.category) })]),
          el('td', {}, [el('a', { href: `/api/files/${f.id}/download`, target: '_blank', text: f.original_name })]),
          el('td.num', { text: fmtSize(f.size_bytes) }),
          el('td.small', { text: fmtDateTime(f.uploaded_at) }),
        ]))
      : [emptyRow(5, 'Fayl yuklanmagan')],
  ));
  draw(h.files);

  const input = el('input', { type: 'file', multiple: 'true', style: 'max-width:320px' });
  const cat = el('select', { style: 'max-width:180px' }, [
    el('option', { value: 'analysis', text: 'Analiz natijasi' }),
    el('option', { value: 'xray', text: 'Rentgen' }),
    el('option', { value: 'ultrasound', text: 'UTT (ultratovush)' }),
    el('option', { value: 'conclusion', text: 'Shifokor xulosasi' }),
    el('option', { value: 'photo', text: 'Rasm' }),
    el('option', { value: 'other', text: 'Boshqa' }),
  ]);

  const uploader = canEdit()
    ? el('div.card', {}, [
        el('h3', { text: 'Fayl yuklash' }),
        el('div.row', {}, [
          input, cat,
          el('button.primary', {
            text: 'Yuklash',
            onclick: async (e) => {
              if (!input.files.length) return toastError(new Error('Fayl tanlang'));
              const btn = e.currentTarget;
              btn.disabled = true;
              try {
                const fd = new FormData();
                for (const f of input.files) fd.append('files', f);
                fd.append('category', cat.value);
                await api.upload(`/files/patient/${p.id}`, fd);
                toastOk('Yuklandi');
                draw((await api.get(`/files/patient/${p.id}`)).items);
                input.value = '';
              } catch (err) { toastError(err); } finally { btn.disabled = false; }
            },
          }),
        ]),
        el('p.small.muted', { text: `Fayllar serverda /Patients/${p.card_number}_… papkasida yil bo‘yicha saqlanadi.` }),
      ])
    : null;

  return el('div', {}, [uploader, el('div.card', {}, [listBox])]);
}

const fileCat = (c) => ({
  analysis: 'Analiz', xray: 'Rentgen', ultrasound: 'UTT',
  conclusion: 'Xulosa', photo: 'Rasm', other: 'Boshqa',
}[c] || c);

function paymentsTab(h) {
  return el('div.card', {}, [table(['Chek', 'Summa', 'Turi', 'Kassir', 'Sana'],
    h.payments.length
      ? h.payments.map((p) => el('tr', {}, [
          el('td.mono', { text: p.receipt_no }),
          el('td.num', { text: fmtMoney(p.is_refund ? -p.amount : p.amount, state.lab.currency) }),
          el('td', { text: { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" }[p.method] }),
          el('td', { text: p.cashier_name }),
          el('td.small', { text: fmtDateTime(p.created_at) }),
        ]))
      : [emptyRow(5, 'To‘lovlar yo‘q')])]);
}

function auditTab(p) {
  const box = el('div.card', {}, [el('div.empty', { text: 'Yuklanmoqda…' })]);
  api.get(`/patients/${p.id}/audit`).then((d) => {
    clear(box).append(
      el('h3', { text: 'Ushbu bemor kartasi bo‘yicha barcha amallar' }),
      table(['Vaqt', 'Xodim', 'Amal', 'Kompyuter', 'Tafsilot'],
        d.items.length
          ? d.items.map((a) => el('tr', {}, [
              el('td.small', { text: fmtDateTime(a.at) }),
              el('td', { text: a.user_name || '—' }),
              el('td', {}, [el('span.badge', { text: a.action })]),
              el('td.small', { text: a.computer_name || '—' }),
              el('td.small', {}, [
                a.description || '',
                a.old_data ? el('div', {}, [
                  el('span.diff-old', { text: JSON.stringify(a.old_data) }), ' → ',
                  el('span.diff-new', { text: JSON.stringify(a.new_data) }),
                ]) : null,
              ]),
            ]))
          : [emptyRow(5)]),
    );
  }).catch((err) => clear(box).append(el('div.error-box', { text: err.message })));
  return box;
}

function editPatientDialog(p) {
  const form = el('div.form-grid', {}, [
    field('Familiya', el('input', { name: 'last_name', value: p.last_name })),
    field('Ism', el('input', { name: 'first_name', value: p.first_name })),
    field('Otasining ismi', el('input', { name: 'middle_name', value: p.middle_name || '' })),
    field('Tug‘ilgan sana', el('input', { name: 'birth_date', type: 'date', value: p.birth_date ? String(p.birth_date).slice(0, 10) : '' })),
    field('Telefon', el('input', { name: 'phone', value: p.phone || '' })),
    field('Manzil', el('input', { name: 'address', value: p.address || '' })),
  ]);
  modal({
    title: 'Bemor ma’lumotini tahrirlash',
    body: el('div', {}, [
      form,
      el('p.small.muted', { text: 'Har bir o‘zgarish audit jurnaliga eski va yangi qiymati bilan yoziladi.' }),
    ]),
    actions: [{
      label: 'Saqlash', primary: true,
      onClick: async () => {
        await api.patch(`/patients/${p.id}`, readForm(form));
        toastOk('Saqlandi');
        location.reload();
      },
    }],
  });
}

/** Analiz buyurtmasi oynasi — bemor kartasidan ham, ish ro'yxatidan ham chaqiriladi. */
export async function newOrderDialog(patient) {
  const { items: tests } = await api.get('/catalog/tests');
  const chosen = new Set();
  const totalBox = el('strong', { text: '0' });

  const byCategory = {};
  for (const t of tests) (byCategory[t.category] ||= []).push(t);

  const list = el('div', { style: 'max-height:320px;overflow-y:auto' },
    Object.entries(byCategory).map(([cat, items]) => el('div', {}, [
      el('label', { text: cat }),
      ...items.map((t) => el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;color:inherit' }, [
        el('input', {
          type: 'checkbox', style: 'width:auto',
          onchange: (e) => {
            e.target.checked ? chosen.add(t.id) : chosen.delete(t.id);
            const sum = tests.filter((x) => chosen.has(x.id)).reduce((s, x) => s + Number(x.price), 0);
            totalBox.textContent = fmtMoney(sum, state.lab.currency);
          },
        }),
        `${t.name} (${t.code})`,
        el('span.muted.small', { text: ` — ${fmtMoney(t.price, state.lab.currency)}` }),
      ])),
    ])));

  const complaint = el('input', { placeholder: 'masalan: qorin og‘rig‘i' });
  const urgent = el('input', { type: 'checkbox', style: 'width:auto' });

  modal({
    title: `Analiz buyurtmasi — ${fullName(patient)}`,
    wide: true,
    body: el('div', {}, [
      field('Shikoyat', complaint),
      el('label', { style: 'display:flex;gap:8px;align-items:center' }, [urgent, 'Shoshilinch (cito)']),
      el('div', { style: 'margin-top:12px' }, [list]),
      el('div.row', { style: 'margin-top:12px' }, ['Jami: ', totalBox]),
    ]),
    actions: [{
      label: 'Buyurtma berish', primary: true,
      onClick: async () => {
        if (!chosen.size) { toastError(new Error('Kamida bitta analiz tanlang')); return false; }
        const o = await api.post('/orders', {
          patient_id: patient.id,
          test_ids: [...chosen],
          complaint: complaint.value.trim() || undefined,
          priority: urgent.checked ? 'urgent' : 'normal',
        });
        toastOk(`Buyurtma yaratildi: ${o.order_number}`);
        location.hash = `#/orders/${o.id}`;
      },
    }],
  });
}
