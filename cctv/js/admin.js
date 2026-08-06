/* BRILIANT — admin panel */
import { S, save, log, ROLES, PLANS, timeAgo, clock, dateStr, EVENT_TYPES } from './store.js';
import { api } from './api.js';
import { brandOf } from './brands.js';
import { h, ico, toast, sheet, closeSheet, confirmSheet, route, go, topbar, empty, field, input, select, toggleRow, navRow } from './ui.js';

const guard = () => {
  const r = S.user?.role;
  if (r !== 'owner' && r !== 'admin') { toast('Ruxsat yoʻq', 'err'); go('/dashboard', true); return false; }
  return true;
};

/* Demo admin maʼlumotlari */
const demoUsers = () => {
  const stored = JSON.parse(localStorage.getItem('briliant:adminusers') || 'null');
  if (stored) return stored;
  const list = [
    { id: 'u1', name: S.user?.name || 'Siz', email: S.user?.email || 'demo@briliant.uz', role: 'owner', plan: S.user?.plan || 'business', cams: S.cameras.length, active: true, last: Date.now() },
    { id: 'u2', name: 'Aziz Karimov', email: 'aziz@example.com', role: 'admin', plan: 'pro', cams: 8, active: true, last: Date.now() - 36e5 },
    { id: 'u3', name: 'Dilnoza R.', email: 'dilnoza@example.com', role: 'operator', plan: 'pro', cams: 4, active: true, last: Date.now() - 5 * 36e5 },
    { id: 'u4', name: 'Sardor T.', email: 'sardor@example.com', role: 'viewer', plan: 'free', cams: 2, active: false, last: Date.now() - 9 * 864e5 },
  ];
  localStorage.setItem('briliant:adminusers', JSON.stringify(list));
  return list;
};
const saveUsers = list => localStorage.setItem('briliant:adminusers', JSON.stringify(list));

route('/admin', () => {
  if (!guard()) return;
  const users = demoUsers();
  const wrap = h('div', { class: 'screen' }, topbar('Admin panel', { sub: 'Tizim boshqaruvi' }));
  wrap.append(h('div', { class: 'stats' },
    st(users.length, 'Foydalanuvchi'), st(S.cameras.length, 'Kamera', 'ok'),
    st(S.servers.length || 3, 'Server', 'warn'), st(S.events.length, 'Hodisa', 'ai')));

  wrap.append(h('div', { class: 'sec' }, h('h3', {}, '24 soatlik faollik')));
  wrap.append(h('div', { class: 'card' }, sparkline()));

  const items = [
    ['Foydalanuvchilar', `${users.length} ta`, 'user', '/admin/users'],
    ['Kameralar', `${S.cameras.length} ta`, 'cam', '/admin/cameras'],
    ['Serverlar', 'MediaMTX, AI, Storage', 'server', '/admin/servers'],
    ['Xotira', 'MinIO / S3 / B2', 'db', '/admin/storage'],
    ['Streaming', 'Faol oqimlar', 'wave', '/admin/streaming'],
    ['AI hodisalar', `${S.events.length} ta`, 'ai', '/admin/events'],
    ['Bildirishnomalar', 'Push, email, Telegram', 'bell', '/admin/notifications'],
    ['Toʻlovlar', 'Tranzaksiyalar', 'card', '/admin/payments'],
    ['Obunalar', 'Tariflar boʻyicha', 'chart', '/admin/subscriptions'],
    ['Rollar va ruxsatlar', 'RBAC', 'key', '/admin/roles'],
    ['Audit log', `${S.audit.length} yozuv`, 'list', '/admin/logs'],
    ['Analitika', 'Hisobotlar', 'chart', '/admin/analytics'],
    ['Tizim sozlamalari', 'Global parametrlar', 'set', '/admin/system'],
  ];
  wrap.append(h('div', { class: 'sec' }, h('h3', {}, "Boʻlimlar")));
  items.forEach(([t, s, i, p]) => wrap.append(navRow(t, s, i, () => go(p))));
  return wrap;
});
const st = (v, l, k) => h('div', { class: 'stat ' + (k || '') }, h('b', {}, String(v)), h('span', {}, l));
function sparkline(data) {
  const d = data || Array.from({ length: 24 }, (_, i) => 20 + Math.round(60 * Math.abs(Math.sin((i + 3) / 3.2)) + Math.random() * 18));
  return h('div', {},
    h('div', { class: 'spark' }, ...d.map(v => h('i', { style: { height: v + '%' } }))),
    h('div', { class: 'row between', style: { fontSize: '10.5px', color: 'var(--txt3)', marginTop: '6px' } },
      h('span', {}, '00:00'), h('span', {}, '12:00'), h('span', {}, '23:00')));
}

/* --- Foydalanuvchilar --- */
route('/admin/users', () => {
  if (!guard()) return;
  let users = demoUsers();
  const list = h('div', {});
  const render = (q = '') => {
    list.innerHTML = '';
    users.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.includes(q)).forEach(u => {
      list.append(h('div', { class: 'rowitem', onclick: () => userSheet(u) },
        h('div', { class: 'ic', html: ico('user', 18) }),
        h('div', { class: 'grow' }, h('b', {}, u.name),
          h('small', {}, `${u.email} · ${u.cams} kamera · ${timeAgo(u.last)}`)),
        h('span', { class: 'tag ' + (u.active ? 'ok' : 'off') }, ROLES[u.role]?.name || u.role)));
    });
  };
  function userSheet(u) {
    const role = select(Object.entries(ROLES).map(([k, v]) => [k, v.name]), { value: u.role });
    const planS = select(Object.entries(PLANS).map(([k, v]) => [k, v.name]), { value: u.plan });
    sheet(u.name, h('div', {},
      h('p', { class: 'muted', style: { fontSize: '13px', marginTop: 0 } }, u.email),
      field('Rol', role), field('Tarif', planS),
      toggleRow('Faol', 'Bloklangan foydalanuvchi kira olmaydi', u.active, v => { u.active = v; }),
      h('button', {
        class: 'btn', onclick: () => {
          u.role = role.value; u.plan = planS.value; saveUsers(users);
          log('admin.user.update', { id: u.id }); closeSheet(); render(); toast('Saqlandi', 'ok');
        }
      }, 'Saqlash'),
      h('button', {
        class: 'btn dan', style: { marginTop: '8px' }, onclick: async () => {
          if (await confirmSheet("Oʻchirish", `${u.name} oʻchirilsinmi?`, "Oʻchirish")) {
            users = users.filter(x => x.id !== u.id); saveUsers(users); closeSheet(); render(); toast("Oʻchirildi");
          }
        }
      }, "Foydalanuvchini oʻchirish")));
  }
  render();
  return h('div', { class: 'screen' },
    topbar('Foydalanuvchilar', { sub: users.length + ' ta akkaunt' }),
    field(null, input({ placeholder: 'Qidirish...', oninput: e => render(e.target.value.toLowerCase()) })),
    list);
});

/* --- Kameralar (admin) --- */
route('/admin/cameras', () => {
  if (!guard()) return;
  const rows = S.cameras.map(c => h('tr', {},
    h('td', {}, h('b', {}, c.name), h('div', { class: 'dim', style: { fontSize: '11px' } }, c.host || c.method)),
    h('td', {}, brandOf(c.brand).name),
    h('td', {}, c.resolution),
    h('td', {}, h('span', { class: 'tag ' + (c.online ? 'ok' : 'off') }, c.online ? 'onlayn' : 'oflayn'))));
  return h('div', { class: 'screen' },
    topbar('Kameralar', { sub: `${S.cameras.filter(c => c.online).length}/${S.cameras.length} onlayn` }),
    h('div', { class: 'card' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Kamera'), h('th', {}, 'Brend'), h('th', {}, 'Sifat'), h('th', {}, 'Holat'))),
      h('tbody', {}, ...rows))));
});

/* --- Serverlar --- */
route('/admin/servers', () => {
  if (!guard()) return;
  const servers = S.servers.length ? S.servers : [
    { id: 's1', name: 'stream-01', role: 'MediaMTX', cpu: 38, ram: 54, streams: 12, up: '18 kun', status: 'ok' },
  ];
  return h('div', { class: 'screen' }, topbar('Serverlar'),
    ...servers.map(s => h('div', { class: 'card', style: { marginBottom: '10px' } },
      h('div', { class: 'row between' },
        h('div', {}, h('b', {}, s.name), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${s.role} · uptime ${s.up}`)),
        h('span', { class: 'tag ' + (s.status === 'ok' ? 'ok' : 'warn') }, s.status === 'ok' ? 'sogʻlom' : 'ogohlantirish')),
      meter('CPU', s.cpu), meter('RAM', s.ram),
      h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, `${s.streams} faol oqim`))),
    h('div', { class: 'card' },
      h('b', { style: { fontSize: '13px' } }, 'Prometheus / Grafana'),
      h('p', { class: 'muted', style: { fontSize: '12.5px', margin: '6px 0 0' } },
        'Metrikalar /metrics endpointidan yigʻiladi. Grafana dashboard: streams, ffmpeg restart, AI latency, storage IOPS.')));
});
function meter(label, v) {
  return h('div', { style: { marginTop: '8px' } },
    h('div', { class: 'row between', style: { fontSize: '11.5px', marginBottom: '4px' } }, h('span', { class: 'muted' }, label), h('b', {}, v + '%')),
    h('div', { class: 'bar' }, h('i', { style: { width: v + '%' } })));
}

/* --- Xotira --- */
route('/admin/storage', () => {
  if (!guard()) return;
  const used = 1240, total = 4096;
  return h('div', { class: 'screen' }, topbar('Xotira'),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('b', {}, 'MinIO (asosiy)'), h('span', { class: 'muted', style: { fontSize: '12px' } }, `${used} / ${total} GB`)),
      h('div', { class: 'bar', style: { marginTop: '8px' } }, h('i', { style: { width: (used / total * 100) + '%' } }))),
    h('div', { class: 'sec' }, h('h3', {}, 'Backend xotira')),
    ...[['MinIO', 'Asosiy klaster · Toshkent', 'ok'], ['AWS S3', 'Cloud backup · eu-central-1', 'ok'], ['Backblaze B2', 'Arxiv (sovuq) ', 'warn']]
      .map(([n, s, k]) => h('div', { class: 'rowitem' },
        h('div', { class: 'ic', html: ico('db', 18) }),
        h('div', { class: 'grow' }, h('b', {}, n), h('small', {}, s)),
        h('span', { class: 'tag ' + k }, k === 'ok' ? 'ulangan' : 'kutilmoqda'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Saqlash muddati')),
    ...Object.entries(PLANS).map(([k, p]) => h('div', { class: 'row between', style: { padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' } },
      h('span', {}, p.name), h('b', {}, p.days + ' kun'))));
});

/* --- Streaming --- */
route('/admin/streaming', () => {
  if (!guard()) return;
  const rows = S.cameras.filter(c => c.online).map((c, i) => h('tr', {},
    h('td', {}, c.name),
    h('td', {}, i % 3 === 0 ? 'WebRTC' : i % 3 === 1 ? 'HLS' : 'RTSP→HLS'),
    h('td', {}, (1 + (i % 4)) + ''),
    h('td', {}, (180 + i * 40) + ' kbps')));
  return h('div', { class: 'screen' }, topbar('Streaming'),
    h('div', { class: 'stats' },
      st(S.cameras.filter(c => c.online).length, 'Faol oqim', 'ok'),
      st('42', 'Tomoshabin'), st('1.8', 'Gbit/s', 'warn'), st('120', 'ms kechikish', 'ai')),
    h('div', { class: 'card', style: { marginTop: '12px' } }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Kamera'), h('th', {}, 'Protokol'), h('th', {}, 'Tomoshabin'), h('th', {}, 'Bitrate'))),
      h('tbody', {}, ...rows))),
    h('div', { class: 'card', style: { marginTop: '12px' } },
      h('b', { style: { fontSize: '13px' } }, 'MediaMTX konfiguratsiyasi'),
      h('pre', { class: 'mono muted', style: { whiteSpace: 'pre-wrap', fontSize: '11px', marginTop: '8px' } },
        'paths:\n  cam_*:\n    source: publisher\n    runOnDemand: ffmpeg -rtsp_transport tcp -i $RTSP_URL -c copy -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH\nwebrtc: yes\nhls: yes\nhlsVariant: lowLatency')));
});

/* --- AI hodisalar (admin) --- */
route('/admin/events', () => {
  if (!guard()) return;
  const byType = {};
  S.events.forEach(e => byType[e.type] = (byType[e.type] || 0) + 1);
  return h('div', { class: 'screen' }, topbar('AI hodisalar'),
    h('div', { class: 'card' },
      ...Object.entries(EVENT_TYPES).map(([k, v]) => {
        const n = byType[k] || 0, max = Math.max(1, ...Object.values(byType));
        return h('div', { style: { marginBottom: '10px' } },
          h('div', { class: 'row between', style: { fontSize: '12.5px', marginBottom: '4px' } }, h('span', {}, v.name), h('b', {}, n)),
          h('div', { class: 'bar' }, h('i', { style: { width: (n / max * 100) + '%' } })));
      })),
    h('div', { class: 'sec' }, h('h3', {}, 'AI modeli')),
    h('div', { class: 'card' },
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Model'), h('b', {}, 'YOLOv11-s (ONNX)')),
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Inferens'), h('b', {}, '18 ms / kadr (GPU)')),
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Chegara (confidence)'), h('b', {}, '0.55')),
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Qurilmada'), h('b', {}, 'TensorFlow Lite'))));
});

/* --- Bildirishnomalar (admin) --- */
route('/admin/notifications', () => {
  if (!guard()) return;
  return h('div', { class: 'screen' }, topbar('Bildirishnomalar'),
    h('div', { class: 'stats' }, st('1 284', 'Push'), st('312', 'Email'), st('96', 'Telegram'), st('2.1', '% xato', 'warn')),
    h('div', { class: 'sec' }, h('h3', {}, 'Kanallar')),
    ...[['Firebase Cloud Messaging', 'Android + Web Push', 'ok'], ['APNs (iOS)', 'Web Push · iOS 16.4+', 'ok'], ['SMTP', 'notify@briliant.uz', 'ok'], ['Telegram Bot', '@briliant_cctv_bot', 'ok']]
      .map(([n, s, k]) => h('div', { class: 'rowitem' },
        h('div', { class: 'ic', html: ico('bell', 18) }),
        h('div', { class: 'grow' }, h('b', {}, n), h('small', {}, s)),
        h('span', { class: 'tag ok' }, 'faol'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Shablon yuborish')),
    h('button', { class: 'btn sec', onclick: () => toast('Test xabar navbatga qoʻyildi (BullMQ)') }, 'Test xabar yuborish'));
});

/* --- Toʻlovlar --- */
route('/admin/payments', () => {
  if (!guard()) return;
  const tx = [
    { id: 'tx1', user: 'aziz@example.com', plan: 'Pro', sum: '99 000', method: 'Payme', ts: Date.now() - 2 * 36e5, ok: true },
    { id: 'tx2', user: 'dilnoza@example.com', plan: 'Pro', sum: '99 000', method: 'Click', ts: Date.now() - 26 * 36e5, ok: true },
    { id: 'tx3', user: 'sardor@example.com', plan: 'Business', sum: '299 000', method: 'Uzcard', ts: Date.now() - 3 * 864e5, ok: false },
  ];
  return h('div', { class: 'screen' }, topbar("Toʻlovlar"),
    h('div', { class: 'stats' }, st('497 000', "So'm (oy)", 'ok'), st(tx.length, 'Tranzaksiya'), st('1', 'Xato', 'dan'), st('12', 'Obuna', 'ai')),
    h('div', { class: 'card', style: { marginTop: '12px' } }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Foydalanuvchi'), h('th', {}, 'Tarif'), h('th', {}, 'Summa'), h('th', {}, 'Holat'))),
      h('tbody', {}, ...tx.map(t => h('tr', {},
        h('td', {}, t.user.split('@')[0], h('div', { class: 'dim', style: { fontSize: '10.5px' } }, `${t.method} · ${dateStr(t.ts)}`)),
        h('td', {}, t.plan), h('td', {}, t.sum),
        h('td', {}, h('span', { class: 'tag ' + (t.ok ? 'ok' : 'off') }, t.ok ? "toʻlangan" : 'xato'))))))));
});

/* --- Obunalar --- */
route('/admin/subscriptions', () => {
  if (!guard()) return;
  const dist = { free: 34, pro: 12, business: 5, enterprise: 1 };
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  return h('div', { class: 'screen' }, topbar('Obunalar', { sub: total + ' ta akkaunt' }),
    h('div', { class: 'card' }, ...Object.entries(dist).map(([k, v]) => h('div', { style: { marginBottom: '10px' } },
      h('div', { class: 'row between', style: { fontSize: '12.5px', marginBottom: '4px' } },
        h('span', {}, PLANS[k].name), h('b', {}, `${v} ta · ${Math.round(v / total * 100)}%`)),
      h('div', { class: 'bar' }, h('i', { style: { width: (v / total * 100) + '%' } }))))),
    h('div', { class: 'sec' }, h('h3', {}, 'Oylik daromad')),
    h('div', { class: 'card' }, sparkline(Array.from({ length: 24 }, (_, i) => 30 + i * 2 + Math.round(Math.random() * 20)))));
});

/* --- Rollar --- */
route('/admin/roles', () => {
  if (!guard()) return;
  const perms = ['camera.add', 'camera.edit', 'camera.delete', 'ptz', 'playback', 'share', 'user.manage', 'admin'];
  return h('div', { class: 'screen' }, topbar('Rollar va ruxsatlar', { sub: 'RBAC' }),
    ...Object.entries(ROLES).map(([k, r]) => h('div', { class: 'card', style: { marginBottom: '10px' } },
      h('b', {}, r.name),
      h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '8px' } },
        ...perms.map(p => h('span', { class: 'tag ' + (r.can.includes('*') || r.can.includes(p) ? 'ok' : 'off') }, p))))),
    h('p', { class: 'muted', style: { fontSize: '12.5px' } },
      'Ruxsatlar backendda JWT ichidagi rol asosida tekshiriladi (NestJS Guards). Mijoz tomonidagi tekshiruv faqat interfeys uchun.'));
});

/* --- Audit log --- */
route('/admin/logs', () => {
  const wrap = h('div', { class: 'screen' }, topbar('Audit log', { sub: S.audit.length + ' yozuv' }));
  if (!S.audit.length) { wrap.append(empty('list', 'Log boʻsh', 'Amallar shu yerda qayd etiladi')); return wrap; }
  wrap.append(h('button', {
    class: 'btn sec', style: { marginBottom: '12px' }, onclick: () => {
      const blob = new Blob([S.audit.map(a => `${new Date(a.ts).toISOString()}\t${a.user}\t${a.action}\t${JSON.stringify(a.meta)}`).join('\n')], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_log.txt'; a.click();
    }
  }, 'Logni yuklab olish'));
  S.audit.slice(0, 200).forEach(a => wrap.append(h('div', { class: 'card', style: { marginBottom: '6px', padding: '10px 12px' } },
    h('div', { class: 'row between' }, h('b', { style: { fontSize: '13px' } }, a.action),
      h('span', { class: 'dim', style: { fontSize: '11px' } }, `${dateStr(a.ts)} ${clock(a.ts)}`)),
    h('div', { class: 'mono dim', style: { fontSize: '11px', marginTop: '3px' } }, `${a.user} · ${JSON.stringify(a.meta)}`))));
  return wrap;
});

/* --- Analitika --- */
route('/admin/analytics', () => {
  if (!guard()) return;
  const perCam = S.cameras.map(c => ({ name: c.name, n: S.events.filter(e => e.cameraId === c.id).length }));
  const max = Math.max(1, ...perCam.map(p => p.n));
  const hours = Array.from({ length: 24 }, (_, hh) => S.events.filter(e => new Date(e.ts).getHours() === hh).length);
  const hmax = Math.max(1, ...hours);
  return h('div', { class: 'screen' }, topbar('Analitika'),
    h('div', { class: 'sec' }, h('h3', {}, 'Hodisalar — soatlar boʻyicha')),
    h('div', { class: 'card' }, h('div', { class: 'spark' }, ...hours.map(v => h('i', { style: { height: Math.max(3, v / hmax * 100) + '%' } }))),
      h('div', { class: 'row between', style: { fontSize: '10.5px', color: 'var(--txt3)', marginTop: '6px' } }, h('span', {}, '00'), h('span', {}, '12'), h('span', {}, '23'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Kameralar boʻyicha')),
    h('div', { class: 'card' }, ...perCam.map(p => h('div', { style: { marginBottom: '9px' } },
      h('div', { class: 'row between', style: { fontSize: '12.5px', marginBottom: '4px' } }, h('span', {}, p.name), h('b', {}, p.n)),
      h('div', { class: 'bar' }, h('i', { style: { width: (p.n / max * 100) + '%' } }))))),
    h('div', { class: 'sec' }, h('h3', {}, 'Tizim')),
    h('div', { class: 'card' },
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Oʻrtacha uptime'), h('b', {}, '99.4%')),
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Kamera uzilishlari (7 kun)'), h('b', {}, '3')),
      h('div', { class: 'row between', style: { padding: '5px 0', fontSize: '13px' } }, h('span', { class: 'muted' }, 'Arxiv hajmi'), h('b', {}, '1.2 TB'))));
});

/* --- Tizim sozlamalari --- */
route('/admin/system', () => {
  if (!guard()) return;
  const cfg = JSON.parse(localStorage.getItem('briliant:sys') || '{}');
  const setCfg = (k, v) => { cfg[k] = v; localStorage.setItem('briliant:sys', JSON.stringify(cfg)); };
  return h('div', { class: 'screen' }, topbar('Tizim sozlamalari'),
    toggleRow("Roʻyxatdan oʻtish ochiq", 'Yangi akkauntlar yaratilishi mumkin', cfg.openReg !== false, v => setCfg('openReg', v), 'user'),
    toggleRow('IP Whitelist', 'Faqat ruxsat etilgan IP lardan kirish', !!cfg.ipWhitelist, v => setCfg('ipWhitelist', v), 'shield'),
    toggleRow('Rate limiting', '100 soʻrov / daqiqa', cfg.rateLimit !== false, v => setCfg('rateLimit', v), 'shield'),
    toggleRow('Cloud Backup', 'Arxivni S3/B2 ga nusxalash', !!cfg.backup, v => setCfg('backup', v), 'cloud'),
    toggleRow('Texnik ish rejimi', 'Foydalanuvchilar uchun ilova yopiladi', !!cfg.maintenance, v => setCfg('maintenance', v), 'set'),
    h('div', { class: 'sec' }, h('h3', {}, 'Saqlash muddati (kun)')),
    field('Standart', input({ type: 'number', value: cfg.retention || 30, onchange: e => setCfg('retention', +e.target.value) })),
    h('div', { class: 'sec' }, h('h3', {}, 'Xizmat holati')),
    ...[['API Gateway', 'ok'], ['Auth Service', 'ok'], ['Camera Service', 'ok'], ['Streaming Service', 'ok'], ['AI Service', 'warn'], ['Notification Service', 'ok'], ['Storage Service', 'ok']]
      .map(([n, k]) => h('div', { class: 'row between', style: { padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' } },
        h('span', {}, n), h('span', { class: 'tag ' + k }, k === 'ok' ? 'ishlayapti' : 'yuklama yuqori'))));
});
