import { api } from '../api.js';
import {
  ROLE_LABEL, avatar, clear, el, emptyRow, field, fmtDateTime, fmtTime, modal, readForm,
  table, toastError, toastOk,
} from '../ui.js';

/**
 * Kameralar paneli va davomat.
 *
 * Yuzni tanish AI kameraning o'zida yoki NVR'da ishlaydi — LabCore undan
 * tayyor hodisa oladi ("kim, qachon, qaysi kamerada ko'rindi") va shu asosda
 * ish joyida bo'lgan vaqtni hisoblaydi.
 */

const SNAPSHOT_REFRESH_MS = 5000;

export async function camerasView() {
  const grid = el('div.grid.cols-3');
  const timers = [];

  // Sahifadan chiqilganda kadr yangilashni to'xtatamiz
  const stop = () => { timers.forEach(clearInterval); window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);

  async function load() {
    const d = await api.get('/cameras');
    timers.forEach(clearInterval);
    timers.length = 0;

    clear(grid).append(...(d.items.length
      ? d.items.map((c) => cameraCard(c, timers, load))
      : [el('div.empty', { text: 'Kamera qo‘shilmagan' })]));
  }
  await load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('h3', { style: 'margin:0', text: '🎥 Kameralar' }),
        el('div.row', {}, [
          el('a.btn.sm', { href: '#/attendance', text: '📋 Davomat' }),
          el('button.sm', { text: 'Yuz yorliqlari', onclick: () => facesDialog() }),
          el('button.primary', { text: '+ Kamera qo‘shish', onclick: () => newCameraDialog(load) }),
        ]),
      ]),
      el('p.small.muted', {
        text: 'Kamera bemor hududiga va natijalar ko‘rinib turgan ekranlarga qaratilmasin — '
            + 'bu tibbiy maxfiylik talabi. Xodimlar kuzatuv borligidan xabardor bo‘lishi kerak. '
            + 'Hodisalar saqlash muddati tugagach avtomatik o‘chiriladi.',
      }),
    ]),
    grid,
  ]);
}

function cameraCard(c, timers, reload) {
  const img = el('img', {
    alt: c.name,
    style: 'width:100%;border-radius:8px;background:var(--surface-2);aspect-ratio:16/9;object-fit:cover',
  });
  const status = el('div.small.muted');

  if (c.snapshot_url) {
    const refresh = () => {
      img.src = `/api/cameras/${c.id}/snapshot?t=${Date.now()}`;
    };
    img.addEventListener('error', () => {
      img.removeAttribute('src');
      status.textContent = 'Kadr olinmadi — kamera o‘chiq yoki manzil noto‘g‘ri';
    });
    img.addEventListener('load', () => { status.textContent = `Kadr: ${fmtTime(new Date())}`; });
    refresh();
    timers.push(setInterval(refresh, SNAPSHOT_REFRESH_MS));
  } else {
    status.textContent = 'Kadr manzili sozlanmagan — jonli ko‘rinish yo‘q';
  }

  return el('div.card', {}, [
    img,
    el('div.row.between', { style: 'margin-top:8px' }, [
      el('div', {}, [
        el('strong', { text: c.name }),
        el('div.small.muted', {
          text: [c.location, c.workstation].filter(Boolean).join(' · ') || '—',
        }),
      ]),
      c.is_active ? el('span.badge.ok', { text: 'Faol' }) : el('span.badge', { text: 'O‘chiq' }),
    ]),
    status,
    el('div.small.muted', {
      text: `24 soatda ${c.events_24h} hodisa · oxirgi: ${c.last_event_at ? fmtDateTime(c.last_event_at) : 'yo‘q'}`,
    }),
    el('div.row', { style: 'margin-top:8px' }, [
      el('button.sm', { text: 'Hodisalar', onclick: () => eventsDialog(c) }),
      el('button.sm', { text: 'Sozlash', onclick: () => editCameraDialog(c, reload) }),
      el('button.sm', { text: 'Kalit', onclick: () => tokenDialog(c) }),
      c.stream_url
        ? el('button.sm', {
            text: 'Oqim manzili',
            onclick: () => modal({
              title: `${c.name} — video oqim`,
              body: el('div', {}, [
                el('p.small.muted', {
                  text: 'Brauzer RTSP oqimini to‘g‘ridan-to‘g‘ri ocha olmaydi. Bu manzilni VLC, '
                      + 'NVR dasturi yoki kamera ilovasida oching. Panelda esa har 5 soniyada '
                      + 'yangilanadigan kadr ko‘rsatiladi.',
                }),
                el('pre.small.mono', { style: 'white-space:pre-wrap', text: c.stream_url }),
              ]),
            }),
          })
        : null,
    ]),
  ]);
}

function cameraForm(c = {}) {
  return el('div', {}, [
    el('div.form-grid', {}, [
      field('Nomi *', el('input', { name: 'name', value: c.name || '' })),
      field('Joylashuvi', el('input', { name: 'location', value: c.location || '', placeholder: '1-qavat, laborant xonasi' })),
      field('Qaysi ish joyini ko‘radi', el('input', { name: 'workstation', value: c.workstation || '', placeholder: 'LAB-PC-02' })),
    ]),
    field('Video oqim (RTSP)', el('input', {
      name: 'stream_url', value: c.stream_url || '',
      placeholder: 'rtsp://192.168.1.50:554/Streaming/Channels/101',
    })),
    field('Kadr manzili (JPEG snapshot)', el('input', {
      name: 'snapshot_url', value: c.snapshot_url || '',
      placeholder: 'http://192.168.1.50/ISAPI/Streaming/channels/101/picture',
    })),
    el('div.form-grid', {}, [
      field('Kamera logini', el('input', { name: 'username', value: c.username || '' })),
      field('Kamera paroli', el('input', { name: 'password', type: 'password', placeholder: c.has_password ? '••••••' : '' })),
    ]),
    el('p.small.muted', {
      text: 'Parol shifrlangan holda saqlanadi va brauzerga hech qachon berilmaydi — '
          + 'kadrni server o‘zi olib beradi.',
    }),
  ]);
}

function newCameraDialog(onDone) {
  const form = cameraForm();
  modal({
    title: 'Yangi kamera',
    wide: true,
    body: form,
    actions: [{
      label: 'Qo‘shish', primary: true,
      onClick: async () => {
        const c = await api.post('/cameras', readForm(form));
        toastOk(`Kamera qo‘shildi. AI uchun kalit: ${c.api_token}`);
        onDone?.();
      },
    }],
  });
}

function editCameraDialog(camera, onDone) {
  const form = cameraForm(camera);
  const active = el('input', { type: 'checkbox', checked: camera.is_active, style: 'width:auto' });
  modal({
    title: `${camera.name} — sozlash`,
    wide: true,
    body: el('div', {}, [
      form,
      el('label', { style: 'display:flex;gap:8px;align-items:center' }, [active, 'Faol']),
    ]),
    actions: [
      {
        label: 'Saqlash', primary: true,
        onClick: async () => {
          const body = readForm(form);
          if (!body.password) delete body.password;   // bo'sh qoldirilsa eski parol saqlanadi
          await api.patch(`/cameras/${camera.id}`, { ...body, is_active: active.checked });
          toastOk('Saqlandi');
          onDone?.();
        },
      },
      {
        label: 'O‘chirish', danger: true,
        onClick: async () => {
          await api.del(`/cameras/${camera.id}`);
          toastOk('Kamera o‘chirildi');
          onDone?.();
        },
      },
    ],
  });
}

function tokenDialog(camera) {
  modal({
    title: `${camera.name} — AI uchun ulanish`,
    wide: true,
    body: el('div', {}, [
      el('p.small.muted', {
        text: 'Kameradagi yoki NVR’dagi yuz tanish tizimi hodisani shu manzilga yuboradi:',
      }),
      el('pre.small.mono', {
        style: 'white-space:pre-wrap',
        text:
          `POST http://<server>:4000/api/cameras/events\n` +
          `X-Camera-Token: <kamera kaliti>\n` +
          `Content-Type: application/json\n\n` +
          `{\n  "type": "face",\n  "face_label": "Dilnoza",\n  "confidence": 96.4,\n` +
          `  "at": "2026-08-04T09:15:00Z"\n}\n\n` +
          `Bir nechta hodisa uchun: { "events": [ {...}, {...} ] }\n` +
          `Turlari: face (yuz tanildi), present, absent (ish joyida yo‘q),\n` +
          `         motion (harakat), tamper (kamera buzildi), offline`,
      }),
      el('p.small.muted', {
        text: 'Kalit "Kamera qo‘shish" paytida ko‘rsatilgan. Yo‘qolsa — yangisini yarating '
            + '(eski kalit ishlamay qoladi).',
      }),
    ]),
    actions: [{
      label: 'Yangi kalit yaratish', danger: true,
      onClick: async () => {
        const r = await api.post(`/cameras/${camera.id}/token`);
        toastOk(`Yangi kalit: ${r.token}`);
      },
    }],
  });
}

async function eventsDialog(camera) {
  const { items } = await api.get(`/cameras/events?camera_id=${camera.id}`);
  const label = {
    face: 'Yuz tanildi', motion: 'Harakat', present: 'Ish joyida',
    absent: 'Ish joyida yo‘q', tamper: 'Kamera buzildi', offline: 'Aloqa uzildi',
  };
  modal({
    title: `${camera.name} — hodisalar`,
    wide: true,
    body: table(['Vaqt', 'Hodisa', 'Kim', 'Ishonch'], items.length
      ? items.map((e) => el('tr', {}, [
          el('td.small', { text: fmtDateTime(e.at) }),
          el('td', {}, [el(`span.badge${e.type === 'tamper' || e.type === 'offline' ? '.danger' : ''}`, {
            text: label[e.type] || e.type,
          })]),
          el('td', { text: e.full_name || e.face_label || '—' }),
          el('td.num.small', { text: e.confidence ? `${e.confidence}%` : '—' }),
        ]))
      : [emptyRow(4, 'Hodisa yo‘q')]),
  });
}

/** AI yuboradigan yuz yorliqlarini xodimlarga bog'lash. */
async function facesDialog() {
  const [faces, staff] = await Promise.all([api.get('/cameras/faces'), api.get('/users')]);
  const body = el('div');

  const draw = (data) => clear(body).append(
    el('h3', { style: 'margin:0 0 8px', text: 'Bog‘langan yorliqlar' }),
    table(['AI yorlig‘i', 'Xodim', 'Hodisalar', ''], data.items.length
      ? data.items.map((f) => el('tr', {}, [
          el('td.mono', { text: f.face_label }),
          el('td', { text: f.full_name ? `${f.full_name} (${ROLE_LABEL[f.role]})` : '— bog‘lanmagan' }),
          el('td.num', { text: f.events }),
          el('td', {}, [el('button.sm', {
            text: 'O‘chirish',
            onclick: async () => {
              await api.del(`/cameras/faces/${f.id}`);
              draw(await api.get('/cameras/faces'));
            },
          })]),
        ]))
      : [emptyRow(4, 'Bog‘lanish yo‘q')]),

    el('h3', { style: 'margin:16px 0 8px', text: 'AI yuborayotgan, lekin bog‘lanmagan yorliqlar' }),
    table(['Yorliq', 'Hodisalar', 'Oxirgi marta', 'Xodimga bog‘lash'], data.unmapped.length
      ? data.unmapped.map((u) => {
          const sel = el('select', {}, [
            el('option', { value: '', text: '— tanlang —' }),
            ...staff.items.filter((s) => s.is_active).map((s) =>
              el('option', { value: s.id, text: `${s.full_name} (${ROLE_LABEL[s.role]})` })),
          ]);
          return el('tr', {}, [
            el('td.mono', { text: u.face_label }),
            el('td.num', { text: u.events }),
            el('td.small', { text: fmtDateTime(u.last_seen) }),
            el('td.row', {}, [sel, el('button.sm.primary', {
              text: 'Bog‘lash',
              onclick: async () => {
                if (!sel.value) return toastError(new Error('Xodimni tanlang'));
                const r = await api.post('/cameras/faces', {
                  face_label: u.face_label, user_id: Number(sel.value),
                });
                toastOk(`Bog‘landi (${r.updated_events} ta eski hodisa yangilandi)`);
                draw(await api.get('/cameras/faces'));
              },
            })]),
          ]);
        })
      : [emptyRow(4, 'Barchasi bog‘langan')]),
  );
  draw(faces);

  modal({ title: 'Yuz yorliqlari ↔ xodimlar', wide: true, body });
}

// ---------------------------------------------------------------------------
// Davomat
// ---------------------------------------------------------------------------

export async function attendanceView() {
  const box = el('div');
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), style: 'max-width:170px' });

  async function load() {
    clear(box).append(el('div.empty', { text: 'Hisoblanmoqda…' }));
    try {
      const d = await api.get(`/cameras/attendance?date=${date.value}`);
      clear(box).append(table(
        ['Xodim', 'Kamerada ko‘rindi', 'Tizimda ishladi', 'Birinchi', 'Oxirgi', 'Uzun tanaffuslar', ''],
        d.items.length
          ? d.items.map((i) => el('tr', {}, [
              el('td', {}, [
                el('div.row', { style: 'flex-wrap:nowrap;gap:10px' }, [
                  avatar(i, { size: 34 }),
                  el('div', {}, [
                    el('div', { text: i.full_name }),
                    el('div.small.muted', { text: ROLE_LABEL[i.role] }),
                  ]),
                ]),
              ]),
              el('td', {}, [bar(i.camera_minutes), el('span.small', { text: ` ${hhmm(i.camera_minutes)}` })]),
              el('td', {}, [bar(i.session_minutes, 'var(--muted)'), el('span.small', { text: ` ${hhmm(i.session_minutes)}` })]),
              el('td.small', { text: i.first_seen ? fmtTime(i.first_seen) : '—' }),
              el('td.small', { text: i.last_seen ? fmtTime(i.last_seen) : '—' }),
              el('td', {}, [
                i.gaps.length
                  ? el('span.badge.warn', { text: `${i.gaps.length} ta · ${hhmm(i.gaps.reduce((s, g) => s + g.minutes, 0))}` })
                  : el('span.muted', { text: '—' }),
              ]),
              el('td', {}, [el('button.sm', {
                text: 'Kun tafsiloti',
                onclick: () => dayDialog(i, date.value),
              })]),
            ]))
          : [emptyRow(7, 'Ma’lumot yo‘q')],
      ));
    } catch (err) {
      clear(box).append(el('div.error-box', { text: err.message }));
    }
  }
  date.addEventListener('change', load);
  await load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row.between', {}, [
        el('div.row', {}, ['Sana:', date]),
        el('a.btn.sm', { href: '#/cameras', text: '🎥 Kameralar' }),
      ]),
      el('p.small.muted', {
        style: 'margin:8px 0 0',
        text: '"Kamerada ko‘rindi" — yuz tanish hodisalari asosidagi taxminiy vaqt. '
            + 'Kamera ko‘rmagan payt xodim boshqa xonada bo‘lishi mumkin, shuning uchun bu '
            + 'raqam ish vaqtining yagona o‘lchovi emas. "Tizimda ishladi" — LabCore sessiyasi.',
      }),
    ]),
    el('div.card', {}, [box]),
  ]);
}

const hhmm = (min) => {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return `${Math.floor(m / 60)} s ${String(m % 60).padStart(2, '0')} d`;
};

const bar = (minutes, color = 'var(--primary)') =>
  el('div', {
    style: `display:inline-block;height:10px;border-radius:4px;background:${color};`
         + `width:${Math.min(100, (Number(minutes) || 0) / 4.8)}px;vertical-align:middle`,
  });

async function dayDialog(person, date) {
  const d = await api.get(`/cameras/attendance/${person.user_id}?date=${date}`);
  const label = { face: 'Yuz tanildi', present: 'Ish joyida', absent: 'Yo‘q', motion: 'Harakat' };

  modal({
    title: `${person.full_name} — ${date}`,
    wide: true,
    body: el('div', {}, [
      el('div.grid.cols-3', {}, [
        stat('Kamerada', hhmm(person.camera_minutes)),
        stat('Tizimda', hhmm(person.session_minutes)),
        stat('Tanaffuslar', `${person.gaps.length} ta`),
      ]),

      el('h3', { style: 'margin:16px 0 8px', text: 'Ish joyida bo‘lgan oraliqlar' }),
      table(['Boshlandi', 'Tugadi', 'Davomiyligi', 'Hodisalar'],
        person.intervals.length
          ? person.intervals.map((i) => el('tr', {}, [
              el('td.small', { text: fmtTime(i.from) }),
              el('td.small', { text: fmtTime(i.to) }),
              el('td.small', { text: hhmm(i.minutes) }),
              el('td.num.small', { text: i.events }),
            ]))
          : [emptyRow(4, 'Kamera hodisasi yo‘q')]),

      person.gaps.length
        ? el('div', {}, [
            el('h3', { style: 'margin:16px 0 8px', text: 'Uzun tanaffuslar' }),
            table(['Dan', 'Gacha', 'Davomiyligi'], person.gaps.map((g) => el('tr', {}, [
              el('td.small', { text: fmtTime(g.from) }),
              el('td.small', { text: fmtTime(g.to) }),
              el('td.small', {}, [el('span.badge.warn', { text: hhmm(g.minutes) })]),
            ]))),
          ])
        : null,

      el('h3', { style: 'margin:16px 0 8px', text: 'Hodisalar lentasi' }),
      el('div', { style: 'max-height:240px;overflow-y:auto' }, [
        table(['Vaqt', 'Hodisa', 'Kamera', 'Ishonch'], d.events.length
          ? d.events.map((e) => el('tr', {}, [
              el('td.small', { text: fmtTime(e.at) }),
              el('td.small', { text: label[e.type] || e.type }),
              el('td.small', { text: e.camera_name || '—' }),
              el('td.num.small', { text: e.confidence ? `${e.confidence}%` : '—' }),
            ]))
          : [emptyRow(4)]),
      ]),
    ]),
  });
}

const stat = (label, value) => el('div.stat', {}, [
  el('div.label', { text: label }),
  el('div.value', { style: 'font-size:20px', text: value }),
]);
