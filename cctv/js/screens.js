/* BRILIANT — asosiy ekranlar: auth, dashboard, kameralar, kamera qoʻshish, tafsilotlar */
import { S, save, log, seedDemo, addCamera, updateCamera, removeCamera, getCam, addGroup,
         localLogin, localRegister, can, plan, camLimitReached, timeAgo, clock, lsGet, lsSet, PLANS } from './store.js';
import { api } from './api.js';
import { BRANDS, brandOf, buildRtsp, buildSnapshot, discoverOnvif, parseCameraQR, hasNativeBridge } from './brands.js';
import { createPlayer, downloadCanvas } from './player.js';
import { h, ico, toast, sheet, closeSheet, confirmSheet, route, go, back, onLeave, topbar,
         empty, field, input, select, toggleRow, navRow, $ } from './ui.js';

/* ---------- Umumiy: jonli koʻrinishli kamera plitkasi ---------- */
const livePool = [];
export function killPlayers() { while (livePool.length) { try { livePool.pop().stop(); } catch {} } }

export function camTile(cam, { list = false, onclick } = {}) {
  const feed = h('div', { style: { position: 'absolute', inset: '0' } });
  const thumb = h('div', { class: 'thumb' }, feed);
  const el = h('div', { class: 'cam' + (list ? ' list-item' : ''), onclick: onclick || (() => go('/live/' + cam.id)) },
    thumb,
    h('div', { class: 'meta' },
      h('b', {}, cam.name),
      h('span', {}, `${brandOf(cam.brand).name} · ${cam.online ? cam.resolution : 'oflayn'}`)));

  if (cam.online) {
    thumb.append(h('div', { class: 'badge tl live' }, h('i', { class: 'pulse' }), 'LIVE'));
    if (cam.recording) thumb.append(h('div', { class: 'badge tr' }, '● REC'));
  } else {
    thumb.append(h('div', { class: 'offline-veil' }, h('div', { html: ico('cam', 22) }), h('div', {}, 'Oflayn')));
  }
  if (cam.favorite) thumb.append(h('div', { class: 'badge br', html: ico('star', 11) }));

  requestAnimationFrame(() => {
    if (!document.body.contains(thumb) || !cam.online) return;
    livePool.push(createPlayer(feed, cam, { fps: 8, hud: false, quality: 'sub' }));
  });
  return el;
}

/* =====================  AUTH  ===================== */
function authShell(title, lead, body, footer) {
  return h('div', { class: 'auth' },
    h('div', { class: 'logo', html: ico('cctv', 38, 'white') }),
    h('h1', {}, title),
    h('p', { class: 'lead' }, lead),
    body, footer);
}

route('/login', () => {
  const email = input({ type: 'email', placeholder: 'email@example.com', autocomplete: 'username' });
  const pass = input({ type: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn' }, 'Kirish');
  const err = h('p', { class: 'muted', style: { color: 'var(--dan)', fontSize: '13px', minHeight: '18px' } });

  btn.onclick = async () => {
    err.textContent = '';
    if (!email.value || !pass.value) return (err.textContent = "Email va parolni kiriting");
    btn.disabled = true; btn.innerHTML = '<i class="spin"></i>';
    try {
      const u = api.enabled ? await api.login(email.value.trim(), pass.value)
                            : localLogin(email.value.trim(), pass.value);
      S.user = { id: u.id, name: u.name, email: u.email, role: u.role || 'owner', plan: u.plan || 'free' };
      save('user');
      if (S.settings.demo) seedDemo();
      log('auth.login');
      go('/dashboard', true);
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false; btn.textContent = 'Kirish';
  };

  return authShell('BRILIANT', 'Barcha kameralaringiz — bitta ilovada',
    h('div', {},
      field('Email', email),
      field('Parol', pass),
      err, btn,
      h('button', { class: 'btn sec', style: { marginTop: '10px' }, onclick: demoEnter }, 'Demo rejimda koʻrish')),
    h('div', { class: 'linkrow' },
      h('a', { href: '#/forgot' }, 'Parolni unutdingizmi?'), ' · ',
      h('a', { href: '#/register' }, "Roʻyxatdan oʻtish")));
});

function demoEnter() {
  S.settings.demo = true;
  S.user = { id: 'demo', name: 'Demo foydalanuvchi', email: 'demo@briliant.uz', role: 'owner', plan: 'business' };
  save('user', 'settings');
  seedDemo(true);
  toast('Demo rejim yoqildi', 'ok');
  go('/dashboard', true);
}

route('/register', () => {
  const name = input({ placeholder: 'Ismingiz' });
  const email = input({ type: 'email', placeholder: 'email@example.com' });
  const pass = input({ type: 'password', placeholder: 'Kamida 6 belgi' });
  const err = h('p', { style: { color: 'var(--dan)', fontSize: '13px', minHeight: '18px' } });
  const btn = h('button', { class: 'btn' }, "Roʻyxatdan oʻtish");
  btn.onclick = async () => {
    err.textContent = '';
    if (!name.value.trim()) return (err.textContent = 'Ismni kiriting');
    if (!/^\S+@\S+\.\S+$/.test(email.value)) return (err.textContent = 'Email notoʻgʻri');
    if (pass.value.length < 6) return (err.textContent = 'Parol kamida 6 belgi boʻlsin');
    btn.disabled = true;
    try {
      const u = api.enabled ? await api.register(name.value.trim(), email.value.trim(), pass.value)
                            : localRegister(name.value.trim(), email.value.trim(), pass.value);
      S.user = { id: u.id, name: u.name, email: u.email, role: 'owner', plan: 'free' };
      save('user');
      if (S.settings.demo) seedDemo();
      go('/dashboard', true);
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
  return authShell('Yangi akkaunt', 'Bir daqiqada roʻyxatdan oʻting',
    h('div', {}, field('Ism', name), field('Email', email), field('Parol', pass), err, btn),
    h('div', { class: 'linkrow' }, 'Akkauntingiz bormi? ', h('a', { href: '#/login' }, 'Kirish')));
});

route('/forgot', () => {
  const email = input({ type: 'email', placeholder: 'email@example.com' });
  const msg = h('p', { style: { fontSize: '13px', minHeight: '18px' } });
  const btn = h('button', { class: 'btn' }, 'Havola yuborish');
  btn.onclick = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.value)) { msg.style.color = 'var(--dan)'; msg.textContent = 'Email notoʻgʻri'; return; }
    btn.disabled = true;
    try { if (api.enabled) await api.post('/auth/forgot', { email: email.value.trim() }); } catch {}
    msg.style.color = 'var(--ok)';
    msg.textContent = 'Agar bunday akkaunt mavjud boʻlsa, tiklash havolasi yuborildi';
    btn.disabled = false;
  };
  return authShell('Parolni tiklash', 'Emailingizga tiklash havolasi yuboriladi',
    h('div', {}, field('Email', email), msg, btn),
    h('div', { class: 'linkrow' }, h('a', { href: '#/login' }, 'Kirishga qaytish')));
});

/* =====================  DASHBOARD  ===================== */
route('/dashboard', () => {
  killPlayers(); onLeave(killPlayers);
  const cams = S.cameras;
  const online = cams.filter(c => c.online).length;
  const rec = cams.filter(c => c.recording).length;
  const today = S.events.filter(e => Date.now() - e.ts < 864e5).length;
  const unread = S.notifs.filter(n => !n.read).length;

  const wrap = h('div', { class: 'screen', style: { paddingTop: '0' } });
  wrap.append(
    topbar(`Salom, ${(S.user?.name || '').split(' ')[0] || 'foydalanuvchi'}`, {
      sub: `${plan().name} tarif · ${cams.length}/${plan().cams === Infinity ? '∞' : plan().cams} kamera`,
      left: h('div', { class: 'logo-sm', style: { width: '38px', height: '38px', borderRadius: '11px', display: 'grid', placeItems: 'center', background: 'linear-gradient(140deg,var(--brand),#7C3AED)', color: '#fff' }, html: ico('cctv', 20) }),
      right: [
        h('button', { class: 'iconbtn', html: ico('bell', 20) + (unread ? '<i class="dot"></i>' : ''), onclick: () => go('/notifications') }),
      ],
    }),
    h('div', { class: 'stats' },
      stat(cams.length, 'Kameralar', ''), stat(online, 'Onlayn', 'ok'),
      stat(rec, 'Yozilmoqda', 'warn'), stat(today, 'Hodisa (24s)', 'ai')),
  );

  // Tezkor amallar
  wrap.append(h('div', { class: 'chips', style: { marginTop: '14px' } },
    quick('Kamera qoʻshish', 'plus', () => go('/add')),
    quick('Multi-ekran', 'grid', () => go('/live')),
    quick('AI hodisalar', 'ai', () => go('/events')),
    quick('Xarita', 'map', () => go('/map')),
    quick('Arxiv', 'clock', () => go('/playback/' + (cams[0]?.id || ''))),
  ));

  // Sevimlilar
  const favs = cams.filter(c => c.favorite);
  if (favs.length) {
    wrap.append(sec('Sevimlilar', 'Barchasi', () => go('/cameras')));
    wrap.append(h('div', { class: 'cams' }, ...favs.slice(0, 4).map(c => camTile(c))));
  }

  // Barcha kameralar
  wrap.append(sec(cams.length ? 'Kameralar' : '', cams.length > 4 ? 'Barchasi' : null, () => go('/cameras')));
  if (!cams.length) {
    wrap.append(empty('cam', 'Hali kamera yoʻq', 'Birinchi kamerangizni ulang — ONVIF orqali avtomatik topish yoki RTSP manzil bilan',
      h('button', { class: 'btn', style: { marginTop: '14px', maxWidth: '260px', marginInline: 'auto' }, onclick: () => go('/add') }, 'Kamera qoʻshish')));
  } else {
    wrap.append(h('div', { class: 'cams' }, ...cams.filter(c => !c.favorite).slice(0, 6).map(c => camTile(c))));
  }

  // Soʻnggi hodisalar
  const evs = S.events.slice(0, 4);
  if (evs.length) {
    wrap.append(sec('Soʻnggi hodisalar', 'Barchasi', () => go('/events')));
    evs.forEach(e => wrap.append(eventCard(e)));
  }
  return wrap;
});

const stat = (v, l, k) => h('div', { class: 'stat ' + (k || '') }, h('b', {}, String(v)), h('span', {}, l));
const quick = (label, icon, onclick) => h('button', { class: 'chip', onclick, style: { display: 'flex', alignItems: 'center', gap: '6px' }, html: ico(icon, 14) + '<span>' + label + '</span>' });
function sec(title, linkText, onclick) {
  return h('div', { class: 'sec' }, h('h3', {}, title || ''),
    linkText ? h('a', { onclick }, linkText) : null);
}

export function eventCard(e) {
  const cam = getCam(e.cameraId);
  const names = { person: 'Odam', vehicle: 'Avtomobil', animal: 'Hayvon', face: 'Yuz', motion: 'Harakat', line: 'Chegara buzilishi', intrusion: 'Hududga kirish', fire: "Yong'in" };
  const th = h('div', { class: 'th' });
  if (e.snap || e.thumb) th.append(h('img', { src: e.snap || e.thumb, style: { width: '100%', height: '100%', objectFit: 'cover' } }));
  else th.append(h('div', { style: { width: '100%', height: '100%', background: 'linear-gradient(140deg,#1C2735,#0B0F14)', display: 'grid', placeItems: 'center', color: 'var(--txt3)' }, html: ico('cam', 18) }));
  return h('div', {
    class: 'ev-card', onclick: () => {
      e.seen = true; save('events');
      go('/playback/' + e.cameraId + '?t=' + e.ts);
    }
  },
    th,
    h('div', { class: 'grow' },
      h('div', { class: 'row', style: { gap: '6px' } },
        h('span', { class: 'tag ' + e.type }, names[e.type] || e.type),
        e.seen ? null : h('span', { class: 'tag ok' }, 'yangi')),
      h('b', { style: { marginTop: '3px' } }, cam?.name || 'Oʻchirilgan kamera'),
      h('small', {}, `${clock(e.ts)} · ${timeAgo(e.ts)} · ishonch ${Math.round((e.confidence || .8) * 100)}%`)));
}

/* =====================  KAMERALAR  ===================== */
route('/cameras', () => {
  killPlayers(); onLeave(killPlayers);
  let mode = lsGet('briliant:camview') || 'grid';
  let filter = 'all', q = '';

  const listBox = h('div', { class: 'cams' + (mode === 'list' ? ' list' : '') });
  const search = input({ placeholder: 'Kamera qidirish...', oninput: e => { q = e.target.value.toLowerCase(); render(); } });

  const chips = h('div', { class: 'chips' });
  function buildChips() {
    chips.innerHTML = '';
    const items = [['all', 'Barchasi'], ['online', 'Onlayn'], ['offline', 'Oflayn'], ['fav', 'Sevimli'], ['rec', 'Yozilmoqda'],
      ...S.groups.map(g => [g.id, g.name])];
    items.forEach(([k, l]) => chips.append(h('button', {
      class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; buildChips(); render(); }
    }, l)));
    chips.append(h('button', { class: 'chip', onclick: newGroup, html: ico('plus', 13) }));
  }
  function newGroup() {
    const nm = input({ placeholder: 'Guruh nomi' });
    sheet('Yangi guruh', h('div', {}, field('Nom', nm),
      h('button', { class: 'btn', onclick: () => { if (nm.value.trim()) { addGroup(nm.value.trim()); buildChips(); closeSheet(); } } }, 'Yaratish')));
  }
  function render() {
    killPlayers();
    let cams = S.cameras.filter(c => !q || c.name.toLowerCase().includes(q) || (c.host || '').includes(q) || brandOf(c.brand).name.toLowerCase().includes(q));
    if (filter === 'online') cams = cams.filter(c => c.online);
    else if (filter === 'offline') cams = cams.filter(c => !c.online);
    else if (filter === 'fav') cams = cams.filter(c => c.favorite);
    else if (filter === 'rec') cams = cams.filter(c => c.recording);
    else if (filter.startsWith('grp_')) cams = cams.filter(c => c.groupId === filter);
    listBox.className = 'cams' + (mode === 'list' ? ' list' : '');
    listBox.innerHTML = '';
    if (!cams.length) { listBox.append(empty('search', 'Topilmadi', 'Filtrni oʻzgartiring yoki yangi kamera qoʻshing')); return; }
    cams.forEach(c => listBox.append(camTile(c, { list: mode === 'list' })));
  }
  buildChips();
  const viewBtn = h('button', {
    class: 'iconbtn', html: ico(mode === 'grid' ? 'list' : 'grid', 20), onclick: () => {
      mode = mode === 'grid' ? 'list' : 'grid';
      lsSet('briliant:camview', mode);
      viewBtn.innerHTML = ico(mode === 'grid' ? 'list' : 'grid', 20);
      render();
    }
  });
  const wrap = h('div', { class: 'screen', style: { paddingTop: '0' } },
    topbar('Kameralar', {
      sub: `${S.cameras.length} ta qurilma`, left: null,
      right: [viewBtn, h('button', { class: 'iconbtn', html: ico('plus', 20), onclick: () => go('/add') })],
    }),
    field(null, search), chips, listBox);
  render();
  return wrap;
});

/* =====================  KAMERA QOʻSHISH  ===================== */
route('/add', () => {
  if (camLimitReached()) {
    return h('div', { class: 'screen' }, topbar("Kamera qoʻshish"),
      empty('shield', 'Tarif limiti', `${plan().name} tarifida ${plan().cams} tagacha kamera ulash mumkin. Tarifni oshiring.`,
        h('button', { class: 'btn', style: { marginTop: '14px' }, onclick: () => go('/subscription') }, 'Tariflar')));
  }
  const methods = [
    ['qr', 'QR kod skaner', 'Qurilma yorligʻidagi QR kodni skanerlang', 'qr'],
    ['onvif', 'ONVIF avtomatik topish', 'Lokal tarmoqdagi kameralarni topadi', 'wifi'],
    ['rtsp', 'RTSP manzil', "To'g'ridan-to'g'ri oqim havolasi", 'link'],
    ['ip', 'IP + login + parol', 'Klassik usul, brend boʻyicha', 'lan'],
    ['cloud', 'Cloud API', 'Tuya, EZVIZ, IMOU, UniFi Protect', 'cloud'],
  ];
  return h('div', { class: 'screen' },
    topbar("Kamera qoʻshish", { sub: 'Ulash usulini tanlang' }),
    ...methods.map(([k, t, s, i]) => navRow(t, s, i, () => go('/add/' + k))),
    h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'row', style: { gap: '8px', marginBottom: '6px' } }, h('span', { style: { color: 'var(--brand)' }, html: ico('info', 16) }), h('b', {}, 'Maslahat')),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '12.5px' } },
        'Kamera va telefon bitta Wi-Fi tarmogʻida boʻlsa, ONVIF orqali topish eng tez usul. Uzoqdan ulanish uchun kamera serverga (NVR yoki bulut gateway) ulangan boʻlishi kerak.')));
});

/* --- 1-usul: QR --- */
route('/add/qr', () => {
  const box = h('div', { class: 'scan-box' });
  const video = h('video', { autoplay: true, playsinline: true, muted: true });
  box.append(video, h('div', { class: 'frame' }));
  const status = h('p', { class: 'muted', style: { textAlign: 'center', fontSize: '13px' } }, 'Kamerani QR kodga qarating');
  const manual = input({ placeholder: 'yoki QR matnini kiriting' });
  let stream, raf, det;

  const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  onLeave(stop);

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      if ('BarcodeDetector' in window) {
        det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const scan = async () => {
          try {
            const codes = await det.detect(video);
            if (codes[0]) { stop(); handle(codes[0].rawValue); return; }
          } catch {}
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } else {
        status.textContent = 'Brauzer QR skanerni qoʻllamaydi — matnni qoʻlda kiriting';
      }
    } catch (e) {
      status.textContent = 'Kameraga ruxsat berilmadi: ' + e.message;
    }
  })();

  function handle(text) {
    const data = parseCameraQR(text);
    if (!data) { toast('QR kod tanilmadi', 'err'); return; }
    stop();
    openCameraForm({ ...data, method: data.method || 'ip' });
  }

  return h('div', { class: 'screen' },
    topbar('QR kod skaner'),
    box, status,
    field(null, manual),
    h('button', { class: 'btn sec', onclick: () => manual.value && handle(manual.value) }, 'Matndan qoʻshish'));
});

/* --- 2-usul: ONVIF --- */
route('/add/onvif', () => {
  const list = h('div', {});
  const status = h('p', { class: 'muted', style: { fontSize: '13px' } });
  const btn = h('button', { class: 'btn' }, 'Qidirishni boshlash');

  async function scan() {
    list.innerHTML = ''; btn.disabled = true; btn.innerHTML = '<i class="spin"></i> Qidirilmoqda...';
    status.textContent = hasNativeBridge() ? 'Android ilova koʻprigi orqali WS-Discovery...'
      : api.enabled ? 'Server orqali lokal tarmoq skanerlanmoqda...'
      : 'Demo rejim: namuna qurilmalar koʻrsatiladi';
    try {
      const devs = await discoverOnvif({ api });
      btn.disabled = false; btn.textContent = 'Qayta qidirish';
      if (!devs.length) { list.append(empty('wifi', 'Qurilma topilmadi', 'Kamera va telefon bir tarmoqda ekanini tekshiring')); return; }
      status.textContent = `${devs.length} ta qurilma topildi`;
      devs.forEach(d => list.append(navRow(d.name, `${d.host} · ${brandOf(d.brand).name}`, 'cam',
        () => openCameraForm({ method: 'onvif', name: d.name, host: d.host, brand: d.brand, model: d.model, port: 554, username: brandOf(d.brand).defUser || 'admin' }))));
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Qayta urinish';
      status.textContent = 'Xato: ' + e.message;
    }
  }
  btn.onclick = scan;
  setTimeout(scan, 300);

  return h('div', { class: 'screen' },
    topbar('ONVIF avtomatik topish', { sub: 'Lokal tarmoq (WS-Discovery)' }),
    btn, status, list);
});

/* --- 3-usul: RTSP --- */
route('/add/rtsp', () => {
  const url = input({ placeholder: 'rtsp://admin:parol@192.168.1.64:554/Streaming/Channels/101' });
  const name = input({ placeholder: 'Kamera nomi' });
  return h('div', { class: 'screen' },
    topbar('RTSP manzil'),
    field('RTSP URL', url),
    field('Nom', name),
    h('button', {
      class: 'btn', onclick: () => {
        if (!/^rtsps?:\/\//i.test(url.value)) return toast('RTSP manzil notoʻgʻri', 'err');
        const parsed = parseCameraQR(url.value) || {};
        openCameraForm({ ...parsed, method: 'rtsp', name: name.value.trim() || parsed.name || 'RTSP kamera', rtspUrl: url.value.trim(), brand: 'custom' });
      }
    }, 'Davom etish'),
    h('div', { class: 'card', style: { marginTop: '18px' } },
      h('b', { style: { fontSize: '13px' } }, 'Brend boʻyicha RTSP yoʻllari'),
      h('div', { style: { marginTop: '10px' } },
        ...Object.entries(BRANDS).filter(([, b]) => b.main).map(([k, b]) =>
          h('div', { class: 'row between', style: { padding: '7px 0', borderTop: '1px solid var(--line)' } },
            h('span', { style: { fontSize: '12.5px', fontWeight: 600 } }, b.name),
            h('span', { class: 'mono muted', style: { fontSize: '11px', textAlign: 'right', wordBreak: 'break-all' } }, b.main))))));
});

/* --- 4-usul: IP + login + parol --- */
route('/add/ip', () => openIpForm());
function openIpForm() {
  const brand = select(Object.entries(BRANDS).map(([k, b]) => [k, b.name + (b.support === 'limited' ? ' (cheklangan)' : b.support === 'api' ? ' (API)' : '')]), { value: 'hikvision' });
  const host = input({ placeholder: '192.168.1.64' });
  const port = input({ type: 'number', value: 554 });
  const user = input({ value: 'admin' });
  const pass = input({ type: 'password', placeholder: 'Parol' });
  const name = input({ placeholder: 'Masalan: Kirish darvozasi' });
  const preview = h('div', { class: 'mono muted', style: { wordBreak: 'break-all', fontSize: '11.5px', marginTop: '-4px', marginBottom: '12px' } });
  const note = h('p', { class: 'muted', style: { fontSize: '12px' } });

  const upd = () => {
    const b = brandOf(brand.value);
    port.value = b.port || 554;
    if (!user.value || user.value === 'admin' || user.value === 'root') user.value = b.defUser || 'admin';
    note.textContent = b.note || '';
    preview.textContent = host.value ? buildRtsp({ brand: brand.value, host: host.value, port: +port.value, username: user.value, password: pass.value, channel: 1 }, { hidePass: true }) : '';
  };
  [brand, host, port, user, pass].forEach(e => e.addEventListener('input', upd));
  brand.addEventListener('change', upd);
  upd();

  return h('div', { class: 'screen' },
    topbar('IP kamera ulash'),
    field('Brend', brand), note,
    field('IP manzil', host),
    h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'grow' }, field('RTSP port', port)),
      h('div', { class: 'grow' }, field('Login', user))),
    field('Parol', pass),
    field('Nom', name),
    preview,
    h('button', {
      class: 'btn', onclick: () => {
        if (!host.value.trim()) return toast('IP manzilni kiriting', 'err');
        openCameraForm({
          method: 'ip', brand: brand.value, host: host.value.trim(), port: +port.value || 554,
          username: user.value, password: pass.value, name: name.value.trim() || host.value.trim(),
        });
      }
    }, 'Tekshirish va qoʻshish'));
}

/* --- 5-usul: Cloud API --- */
route('/add/cloud', () => {
  const provs = [
    ['tuya', 'Tuya / Smart Life', 'Client ID va Secret (Tuya IoT Platform)'],
    ['ezviz', 'EZVIZ', 'AppKey va AppSecret (EZVIZ Open Platform)'],
    ['imou', 'IMOU', 'AppId va AppSecret (IMOU Open Platform)'],
    ['unifi', 'UniFi Protect', 'Konsol manzili va API kalit'],
  ];
  return h('div', { class: 'screen' },
    topbar('Cloud API orqali ulash', { sub: "Ishlab chiqaruvchi bulutidagi kameralar" }),
    ...provs.map(([k, n, s]) => navRow(n, s, 'cloud', () => cloudForm(k, n))),
    h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '14px' } },
      'Bulut kalitlari faqat serverda saqlanadi va qurilmangizdan chiqmaydi. Demo rejimda bogʻlanish simulyatsiya qilinadi.'));
});

function cloudForm(provider, title) {
  const a = input({ placeholder: provider === 'unifi' ? 'https://192.168.1.1' : 'App / Client ID' });
  const b = input({ type: 'password', placeholder: provider === 'unifi' ? 'API kalit' : 'App Secret' });
  const region = select([['eu', 'Yevropa'], ['us', 'AQSh'], ['cn', 'Xitoy'], ['in', 'Hindiston']], { value: 'eu' });
  const btn = h('button', { class: 'btn' }, 'Bogʻlash');
  btn.onclick = async () => {
    btn.disabled = true; btn.innerHTML = '<i class="spin"></i>';
    try {
      let devices;
      if (api.enabled) {
        await api.cloudLink(provider, { key: a.value, secret: b.value, region: region.value });
        devices = (await api.cloudDevices(provider)).devices || [];
      } else {
        await new Promise(r => setTimeout(r, 1200));
        devices = [{ id: 'c1', name: provider.toUpperCase() + ' kamera 1' }, { id: 'c2', name: provider.toUpperCase() + ' kamera 2' }];
      }
      closeSheet();
      const list = h('div', {}, ...devices.map(d => navRow(d.name, provider, 'cam', () => {
        const cam = addCamera({ name: d.name, brand: provider === 'unifi' ? 'unifi' : provider, method: 'cloud', cloudId: d.id, host: '', online: true });
        closeSheet(); toast('Kamera qoʻshildi', 'ok'); go('/live/' + cam.id);
      })));
      sheet('Topilgan qurilmalar', list);
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Bogʻlash';
  };
  sheet(title, h('div', {},
    field(provider === 'unifi' ? 'Konsol manzili' : 'App / Client ID', a),
    field(provider === 'unifi' ? 'API kalit' : 'App Secret', b),
    provider === 'unifi' ? null : field('Hudud', region),
    btn));
}

/* --- Umumiy: kamera formasi (tekshirish + saqlash) --- */
export function openCameraForm(data) {
  const name = input({ value: data.name || 'Yangi kamera' });
  const group = select([['', 'Guruhsiz'], ...S.groups.map(g => [g.id, g.name])], { value: data.groupId || '' });
  const ptz = h('div', { class: 'switch' + (brandOf(data.brand).ptz ? ' on' : '') });
  const status = h('div', { class: 'card', style: { marginBottom: '12px', fontSize: '12.5px' } }, 'Ulanish tekshirilmoqda...');
  const btn = h('button', { class: 'btn' }, 'Saqlash');
  let probed = null;

  const body = h('div', {},
    status,
    field('Nom', name),
    field('Guruh', group),
    h('div', { class: 'rowitem', onclick: () => ptz.classList.toggle('on') },
      h('div', { class: 'ic', html: ico('ptz', 18) }),
      h('div', { class: 'grow' }, h('b', {}, 'PTZ boshqaruvi'), h('small', {}, 'Kamera burilish/zoomni qoʻllasa')),
      ptz),
    btn);

  sheet('Kamerani qoʻshish', body);

  (async () => {
    try {
      if (api.enabled) {
        probed = await api.probe(data);
        status.innerHTML = `<div class="row" style="gap:8px"><span style="color:var(--ok)">${ico('check', 16)}</span>
          <div><b>Ulanish muvaffaqiyatli</b><br><span class="muted">${probed.resolution || ''} ${probed.codec || ''} ${probed.fps ? probed.fps + ' fps' : ''}</span></div></div>`;
      } else {
        await new Promise(r => setTimeout(r, 900));
        status.innerHTML = `<div class="row" style="gap:8px"><span style="color:var(--ok)">${ico('check', 16)}</span>
          <div><b>Ulanish muvaffaqiyatli</b><br><span class="muted">1920x1080 · H.264 · 20 fps</span></div></div>`;
      }
    } catch (e) {
      status.innerHTML = `<div class="row" style="gap:8px"><span style="color:var(--warn)">${ico('info', 16)}</span>
        <div><b>Ulanib boʻlmadi</b><br><span class="muted">${e.message}. Baribir saqlash mumkin.</span></div></div>`;
    }
  })();

  btn.onclick = async () => {
    btn.disabled = true;
    const payload = {
      ...data, name: name.value.trim() || 'Kamera',
      groupId: group.value || null,
      ptz: ptz.classList.contains('on'),
      resolution: probed?.resolution || '1920x1080',
      codec: probed?.codec || 'H.264',
      demoTag: ['gate', 'yard', 'park', 'store', 'hall', 'back'][S.cameras.length % 6],
    };
    try {
      let cam;
      if (api.enabled) { const r = await api.createCamera(payload); cam = addCamera({ ...payload, ...r }); }
      else cam = addCamera(payload);
      closeSheet();
      toast('Kamera qoʻshildi', 'ok');
      go('/live/' + cam.id);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
}

/* =====================  KAMERA TAFSILOTLARI  ===================== */
route('/camera/:id', id => {
  const cam = getCam(id);
  if (!cam) { go('/cameras', true); return; }
  const wrap = h('div', { class: 'screen' });
  const b = brandOf(cam.brand);

  const nameI = input({ value: cam.name });
  nameI.onchange = () => updateCamera(id, { name: nameI.value.trim() || cam.name });

  wrap.append(
    topbar('Kamera sozlamalari', { sub: cam.name }),
    field('Nom', nameI),
    field('Guruh', select([['', 'Guruhsiz'], ...S.groups.map(g => [g.id, g.name])], {
      value: cam.groupId || '', onchange: e => updateCamera(id, { groupId: e.target.value || null }),
    })),
    h('div', { class: 'sec' }, h('h3', {}, 'Funksiyalar')),
    toggleRow('Sevimli', 'Boshqaruv panelida yuqorida', cam.favorite, v => updateCamera(id, { favorite: v }), 'star'),
    toggleRow('Uzluksiz yozish', '24/7 arxivga yozish', cam.recording, v => updateCamera(id, { recording: v }), 'rec'),
    toggleRow('Harakat aniqlash', 'Motion detection', cam.motion?.enabled, v => updateCamera(id, { motion: { ...cam.motion, enabled: v } }), 'wave'),
    toggleRow('AI: odam', 'Person detection', cam.ai?.person, v => updateCamera(id, { ai: { ...cam.ai, person: v } }), 'ai'),
    toggleRow('AI: avtomobil', 'Vehicle detection', cam.ai?.vehicle, v => updateCamera(id, { ai: { ...cam.ai, vehicle: v } }), 'ai'),
    toggleRow('AI: hayvon', 'Animal detection', cam.ai?.animal, v => updateCamera(id, { ai: { ...cam.ai, animal: v } }), 'ai'),
    toggleRow('PTZ', 'Burish va zoom boshqaruvi', cam.ptz, v => updateCamera(id, { ptz: v }), 'ptz'),
    toggleRow('Mikrofon (kamera ovozi)', 'Audio in', cam.audioIn, v => updateCamera(id, { audioIn: v }), 'spk'),
    toggleRow('Dinamik (gapirish)', 'Audio out / two-way', cam.audioOut, v => updateCamera(id, { audioOut: v }), 'mic'),

    h('div', { class: 'sec' }, h('h3', {}, 'Tungi rejim (IR)')),
    h('div', { class: 'tabs' }, ...[['auto', 'Avto'], ['on', 'Yoqilgan'], ['off', "Oʻchirilgan"]].map(([v, l]) =>
      h('button', {
        class: cam.ir === v ? 'on' : '', onclick: e => {
          [...e.target.parentNode.children].forEach(x => x.classList.remove('on'));
          e.target.classList.add('on'); updateCamera(id, { ir: v });
          if (api.enabled) api.setIr(id, v).catch(() => {});
        }
      }, l))),

    h('div', { class: 'sec' }, h('h3', {}, 'Texnik maʼlumot')),
    h('div', { class: 'card' },
      infoRow('Brend', b.name), infoRow('Model', cam.model || '—'),
      infoRow('IP', cam.host || '—'), infoRow('Port', String(cam.port || '—')),
      infoRow('Kodek', `${cam.codec} · ${cam.resolution} · ${cam.fps} fps`),
      infoRow('Ulash usuli', { qr: 'QR', onvif: 'ONVIF', rtsp: 'RTSP', ip: 'IP', cloud: 'Cloud API' }[cam.method] || cam.method),
      infoRow('Holat', cam.online ? 'Onlayn' : 'Oflayn'),
      infoRow('Oxirgi signal', timeAgo(cam.lastSeen))),
    h('div', { class: 'card', style: { marginTop: '10px' } },
      h('div', { class: 'row between' }, h('b', { style: { fontSize: '13px' } }, 'RTSP manzil'),
        h('button', {
          class: 'btn sm sec', onclick: () => {
            navigator.clipboard?.writeText(buildRtsp(cam)).then(() => toast('Nusxalandi', 'ok'), () => toast('Nusxalab boʻlmadi', 'err'));
          }
        }, 'Nusxalash')),
      h('div', { class: 'mono muted', style: { wordBreak: 'break-all', marginTop: '6px' } }, buildRtsp(cam, { hidePass: true }) || '—'),
      buildSnapshot(cam) ? h('div', { class: 'mono dim', style: { wordBreak: 'break-all', marginTop: '8px', fontSize: '11px' } }, 'Snapshot: ' + buildSnapshot(cam)) : null),

    h('div', { class: 'sec' }, h('h3', {}, 'Joylashuv')),
    h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'grow' }, field('Kenglik (lat)', input({ value: cam.lat ?? '', placeholder: '41.3111', onchange: e => updateCamera(id, { lat: parseFloat(e.target.value) || null }) }))),
      h('div', { class: 'grow' }, field('Uzunlik (lng)', input({ value: cam.lng ?? '', placeholder: '69.2797', onchange: e => updateCamera(id, { lng: parseFloat(e.target.value) || null }) })))),
    h('button', {
      class: 'btn sec', onclick: () => {
        navigator.geolocation?.getCurrentPosition(p => {
          updateCamera(id, { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
          toast('Joriy joylashuv saqlandi', 'ok'); go('/camera/' + id);
        }, () => toast('Joylashuvni olib boʻlmadi', 'err'));
      }
    }, 'Joriy joylashuvni olish'),

    h('div', { class: 'sec' }, h('h3', {}, 'Ulashish')),
    navRow('Ushbu kamerani ulashish', 'Boshqa foydalanuvchilarga ruxsat', 'share', () => go('/share/' + id)),

    h('button', {
      class: 'btn dan', style: { marginTop: '20px' }, onclick: async () => {
        if (await confirmSheet("Kamerani oʻchirish", `"${cam.name}" oʻchirilsin? Arxiv yozuvlari ham oʻchadi.`, "Oʻchirish")) {
          if (api.enabled) api.deleteCamera(id).catch(() => {});
          removeCamera(id); toast("Oʻchirildi"); go('/cameras', true);
        }
      }
    }, "Kamerani oʻchirish"));
  return wrap;
});

const infoRow = (k, v) => h('div', { class: 'row between', style: { padding: '6px 0', fontSize: '13px' } },
  h('span', { class: 'muted' }, k), h('b', { style: { fontWeight: 600 } }, v));

/* =====================  ULASHISH  ===================== */
route('/share/:id', id => {
  const cam = getCam(id);
  if (!cam) { go('/cameras', true); return; }
  const list = h('div', {});
  const render = () => {
    list.innerHTML = '';
    const items = S.shares.filter(s => s.cameraId === id);
    if (!items.length) { list.append(empty('share', 'Hali ulashilmagan', 'Email orqali kirish huquqi bering')); return; }
    items.forEach(s => list.append(h('div', { class: 'rowitem' },
      h('div', { class: 'ic', html: ico('user', 18) }),
      h('div', { class: 'grow' }, h('b', {}, s.email), h('small', {}, ({ viewer: "Koʻruvchi", operator: 'Operator', admin: 'Administrator' })[s.role])),
      h('button', {
        class: 'iconbtn plain', html: ico('trash', 18), onclick: () => {
          S.shares = S.shares.filter(x => x.id !== s.id); save('shares'); render();
        }
      }))));
  };
  render();
  const email = input({ type: 'email', placeholder: 'email@example.com' });
  const role = select([['viewer', "Koʻruvchi — faqat jonli va arxiv"], ['operator', 'Operator — PTZ va boshqaruv'], ['admin', 'Administrator — toʻliq']], { value: 'viewer' });
  return h('div', { class: 'screen' },
    topbar('Ulashish', { sub: cam.name }),
    list,
    h('div', { class: 'sec' }, h('h3', {}, 'Yangi ruxsat')),
    field('Email', email), field('Rol', role),
    h('button', {
      class: 'btn', onclick: () => {
        if (!/^\S+@\S+\.\S+$/.test(email.value)) return toast('Email notoʻgʻri', 'err');
        S.shares.push({ id: 'sh_' + Date.now(), cameraId: id, email: email.value.trim().toLowerCase(), role: role.value, expires: null });
        save('shares'); log('camera.share', { id, email: email.value });
        email.value = ''; render(); toast('Ruxsat berildi', 'ok');
      }
    }, 'Ruxsat berish'));
});
