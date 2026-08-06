/* ITCode CCTV — sozlamalar, akkaunt, obuna, yordam */
import { S, save, log, resetAll, seedDemo, PLANS, ROLES, plan, timeAgo } from './store.js';
import { api } from './api.js';
import { h, ico, toast, sheet, closeSheet, confirmSheet, route, go, topbar, empty, field, input, select, toggleRow, navRow } from './ui.js';

route('/settings', () => {
  const u = S.user || {};
  const wrap = h('div', { class: 'screen', style: { paddingTop: '0' } },
    topbar('Sozlamalar', { left: null }));

  wrap.append(h('div', { class: 'card tap', style: { display: 'flex', gap: '12px', alignItems: 'center' }, onclick: () => go('/settings/account') },
    h('div', { style: { width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(140deg,var(--brand),#7C3AED)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: '18px' } },
      (u.name || 'U')[0].toUpperCase()),
    h('div', { class: 'grow' }, h('b', {}, u.name || 'Foydalanuvchi'), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, u.email || ''),
      h('div', { style: { marginTop: '4px' } }, h('span', { class: 'tag ok' }, plan().name + ' tarif'), ' ',
        h('span', { class: 'tag off' }, ROLES[u.role || 'viewer']?.name))),
    h('span', { class: 'dim', html: ico('chev', 18) })));

  wrap.append(h('div', { class: 'sec' }, h('h3', {}, 'Ilova')));
  wrap.append(
    navRow('Bildirishnomalar', 'Push, email, Telegram', 'bell', () => go('/settings/notifications')),
    navRow('AI va harakat aniqlash', 'Sezuvchanlik va turlar', 'ai', () => go('/settings/ai')),
    navRow('Video va tarmoq', 'Sifat, apparat tezlashtirish', 'wave', () => go('/settings/video')),
    navRow('Ulashilgan kameralar', `${S.shares.length} ta ruxsat`, 'share', () => go('/settings/shares')),
    navRow('Xavfsizlik', '2FA, seanslar, audit log', 'shield', () => go('/settings/security')),
    navRow('Obuna va tarif', plan().name, 'card', () => go('/subscription')));

  if ((u.role === 'owner' || u.role === 'admin')) {
    wrap.append(h('div', { class: 'sec' }, h('h3', {}, 'Boshqaruv')));
    wrap.append(navRow('Admin panel', 'Foydalanuvchilar, serverlar, analitika', 'server', () => go('/admin')));
  }

  wrap.append(h('div', { class: 'sec' }, h('h3', {}, 'Server ulanishi')));
  const apiInp = input({ value: S.settings.apiBase, placeholder: 'https://api.itcode-cctv.uz' });
  wrap.append(
    toggleRow('Demo rejim', "Serversiz, qurilmada sintez qilingan oqim", S.settings.demo, v => {
      S.settings.demo = v; save('settings');
      if (v) { api.disconnectWs(); seedDemo(); }
      else api.connectWs();
      toast(v ? 'Demo rejim yoqildi' : 'Server rejimi', 'ok');
    }, 'cloud'),
    field('Backend API manzili', apiInp),
    h('button', {
      class: 'btn sec', onclick: async () => {
        S.settings.apiBase = apiInp.value.trim().replace(/\/+$/, ''); save('settings');
        if (!S.settings.apiBase) return toast("Manzil tozalandi");
        try {
          const r = await fetch(S.settings.apiBase + '/health', { headers: { Accept: 'application/json' } });
          toast(r.ok ? 'Server javob berdi ✓' : 'Server xatosi: ' + r.status, r.ok ? 'ok' : 'err');
        } catch (e) { toast('Ulanib boʻlmadi: ' + e.message, 'err'); }
      }
    }, 'Ulanishni tekshirish'));

  wrap.append(h('div', { class: 'sec' }, h('h3', {}, 'Koʻrinish')));
  wrap.append(h('div', { class: 'tabs' }, ...[['dark', 'Tungi'], ['light', 'Kunduzgi']].map(([v, l]) =>
    h('button', {
      class: S.settings.theme === v ? 'on' : '', onclick: e => {
        S.settings.theme = v; save('settings');
        document.documentElement.dataset.theme = v;
        document.querySelector('meta[name=theme-color]')?.setAttribute('content', v === 'dark' ? '#0B0F14' : '#F2F5F9');
        [...e.target.parentNode.children].forEach(b => b.classList.remove('on'));
        e.target.classList.add('on');
      }
    }, l))));

  wrap.append(h('div', { class: 'sec' }, h('h3', {}, 'Boshqa')));
  wrap.append(
    navRow('Yordam markazi', 'Koʻp beriladigan savollar', 'info', () => go('/help')),
    navRow('Ilova haqida', 'Versiya, litsenziyalar', 'shield', () => go('/about')),
    h('button', {
      class: 'btn sec', style: { marginTop: '10px' }, onclick: async () => {
        if (await confirmSheet('Chiqish', 'Akkauntdan chiqmoqchimisiz?', 'Chiqish')) {
          api.logout(); api.disconnectWs();
          S.user = null; S.tokens = null; save('user', 'tokens'); log('auth.logout');
          go('/login', true);
        }
      }
    }, 'Chiqish'));
  return wrap;
});

/* --- Akkaunt --- */
route('/settings/account', () => {
  const u = S.user || {};
  const name = input({ value: u.name || '' });
  const email = input({ value: u.email || '', type: 'email', disabled: true });
  return h('div', { class: 'screen' },
    topbar('Akkaunt'),
    field('Ism', name), field('Email', email),
    h('button', {
      class: 'btn', onclick: async () => {
        S.user = { ...u, name: name.value.trim() || u.name }; save('user');
        if (api.enabled) { try { await api.patch('/users/me', { name: S.user.name }); } catch (e) { toast(e.message, 'err'); } }
        toast('Saqlandi', 'ok');
      }
    }, 'Saqlash'),
    h('div', { class: 'sec' }, h('h3', {}, 'Parol')),
    navRow("Parolni oʻzgartirish", '', 'key', () => {
      const a = input({ type: 'password', placeholder: 'Joriy parol' });
      const b = input({ type: 'password', placeholder: 'Yangi parol' });
      sheet("Parolni oʻzgartirish", h('div', {}, field('Joriy', a), field('Yangi', b),
        h('button', {
          class: 'btn', onclick: async () => {
            if (b.value.length < 6) return toast('Yangi parol qisqa', 'err');
            if (api.enabled) { try { await api.post('/auth/change-password', { current: a.value, next: b.value }); } catch (e) { return toast(e.message, 'err'); } }
            closeSheet(); toast("Parol oʻzgartirildi", 'ok');
          }
        }, 'Saqlash')));
    }),
    h('div', { class: 'sec' }, h('h3', {}, 'Maʼlumotlar')),
    navRow('Maʼlumotlarni eksport qilish', 'JSON fayl', 'down', exportData),
    h('button', {
      class: 'btn dan', style: { marginTop: '18px' }, onclick: async () => {
        if (await confirmSheet("Akkauntni oʻchirish", "Barcha kameralar, arxiv va hodisalar oʻchiriladi. Bu amalni qaytarib boʻlmaydi.", "Oʻchirish")) {
          if (api.enabled) { try { await api.del('/users/me'); } catch {} }
          resetAll(); localStorage.clear(); go('/login', true);
        }
      }
    }, "Akkauntni oʻchirish"));
});

function exportData() {
  const data = { exportedAt: new Date().toISOString(), user: S.user, cameras: S.cameras.map(c => ({ ...c, password: undefined })), groups: S.groups, events: S.events, settings: { ...S.settings, apiBase: undefined } };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `itcctv_export_${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Eksport qilindi', 'ok');
}

/* --- Bildirishnomalar --- */
route('/settings/notifications', () => {
  const st = S.settings;
  const tg = input({ value: st.telegramChat || '', placeholder: '@username yoki chat ID' });
  return h('div', { class: 'screen' },
    topbar('Bildirishnomalar'),
    toggleRow('Push bildirishnoma', 'Telefon ekranida koʻrsatiladi', st.push, async v => {
      st.push = v; save('settings');
      if (v && 'Notification' in window && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') toast('Brauzer ruxsat bermadi', 'err');
        else if (api.enabled) subscribePush();
      }
    }, 'bell'),
    toggleRow('Email', S.user?.email || '', st.email, v => { st.email = v; save('settings'); }, 'mail'),
    toggleRow('Telegram', 'Bot orqali xabar', st.telegram, v => { st.telegram = v; save('settings'); }, 'tg'),
    field('Telegram chat', tg),
    h('button', {
      class: 'btn sec', onclick: async () => {
        st.telegramChat = tg.value.trim(); save('settings');
        if (api.enabled) { try { await api.post('/notifications/telegram', { chat: st.telegramChat }); } catch (e) { return toast(e.message, 'err'); } }
        toast('Saqlandi', 'ok');
      }
    }, 'Telegramni ulash'),
    h('div', { class: 'sec' }, h('h3', {}, 'Sokin soatlar')),
    h('div', { class: 'row', style: { gap: '10px' } },
      h('div', { class: 'grow' }, field('Boshlanish', input({ type: 'time', value: st.quietFrom, onchange: e => { st.quietFrom = e.target.value; save('settings'); } }))),
      h('div', { class: 'grow' }, field('Tugash', input({ type: 'time', value: st.quietTo, onchange: e => { st.quietTo = e.target.value; save('settings'); } })))),
    h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Sokin soatlarda push kelmaydi, lekin hodisalar arxivga yoziladi.'),
    h('button', {
      class: 'btn sec', style: { marginTop: '10px' }, onclick: () => {
        if (!('Notification' in window)) return toast('Brauzer qoʻllamaydi', 'err');
        if (Notification.permission === 'granted') { new Notification('ITCode CCTV', { body: 'Sinov bildirishnomasi', icon: './icons/icon-192.png' }); toast('Yuborildi', 'ok'); }
        else Notification.requestPermission().then(p => p === 'granted' && new Notification('ITCode CCTV', { body: 'Sinov bildirishnomasi' }));
      }
    }, 'Sinov bildirishnomasi'));
});

async function subscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const key = await api.get('/notifications/vapid').then(r => r.publicKey).catch(() => null);
    if (!key) return;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
    await api.post('/notifications/subscribe', sub.toJSON());
  } catch (e) { console.warn('push:', e.message); }
}
function urlB64(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* --- AI sozlamalari --- */
route('/settings/ai', () => {
  const st = S.settings;
  const sens = h('input', { type: 'range', min: 10, max: 100, value: st.motionSens, class: 'inp', style: { padding: '8px' } });
  sens.oninput = () => { st.motionSens = +sens.value; save('settings'); lbl.textContent = sens.value + '%'; };
  const lbl = h('b', {}, st.motionSens + '%');
  return h('div', { class: 'screen' },
    topbar('AI va harakat'),
    toggleRow('Odam aniqlash', 'YOLOv11 person detection', st.aiPerson, v => { st.aiPerson = v; save('settings'); }, 'ai'),
    toggleRow('Avtomobil aniqlash', 'Vehicle detection', st.aiVehicle, v => { st.aiVehicle = v; save('settings'); }, 'ai'),
    toggleRow('Hayvon aniqlash', 'Animal detection', st.aiAnimal, v => { st.aiAnimal = v; save('settings'); }, 'ai'),
    toggleRow('Yuz aniqlash', 'Face detection (ixtiyoriy)', st.aiFace, v => { st.aiFace = v; save('settings'); }, 'user'),
    h('div', { class: 'sec' }, h('h3', {}, 'Harakat sezuvchanligi'), lbl),
    sens,
    h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Yuqori sezuvchanlik koʻproq hodisa beradi, lekin yolgʻon ishga tushish ehtimoli oshadi.'),
    h('div', { class: 'sec' }, h('h3', {}, 'Qoidalar')),
    navRow('Chegara chizigʻi (line crossing)', 'Kamera boʻyicha sozlanadi', 'line', () => toast('Kamera sozlamalarida belgilanadi')),
    navRow('Hudud (intrusion zone)', 'Koʻp burchakli hudud', 'filter', () => toast('Kamera sozlamalarida belgilanadi')),
    navRow('Avtomatik snapshot', 'Har bir hodisada rasm saqlash', 'snap', () => toast('Yoqilgan')));
});

/* --- Video va tarmoq --- */
route('/settings/video', () => {
  const st = S.settings;
  return h('div', { class: 'screen' },
    topbar('Video va tarmoq'),
    toggleRow('Apparat tezlashtirish', 'Qurilma dekoderidan foydalanish', st.hwAccel, v => { st.hwAccel = v; save('settings'); }, 'wave'),
    toggleRow('Faqat Wi-Fi da yuklash', 'Mobil internetda arxiv yuklanmaydi', st.saveWifiOnly, v => { st.saveWifiOnly = v; save('settings'); }, 'wifi'),
    toggleRow('Avtomatik yozib olish', 'Hodisa boʻlganda 30 s klip', st.autoRecord, v => { st.autoRecord = v; save('settings'); }, 'rec'),
    h('div', { class: 'sec' }, h('h3', {}, 'Multi-ekranda sifat')),
    select([['sub', 'Har doim tejamkor (SD)'], ['auto', 'Avtomatik'], ['main', 'Har doim yuqori']], {
      value: st.gridQuality || 'sub', onchange: e => { st.gridQuality = e.target.value; save('settings'); },
    }),
    h('div', { class: 'sec' }, h('h3', {}, 'Kesh')),
    h('button', {
      class: 'btn sec', onclick: async () => {
        if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
        toast('Kesh tozalandi', 'ok');
      }
    }, 'Keshni tozalash'));
});

/* --- Ulashilgan kameralar --- */
route('/settings/shares', () => {
  const wrap = h('div', { class: 'screen' }, topbar('Ulashilgan kameralar'));
  if (!S.shares.length) { wrap.append(empty('share', 'Ruxsatlar yoʻq', 'Kamera sozlamalarida ulashing')); return wrap; }
  S.shares.forEach(s => {
    const cam = S.cameras.find(c => c.id === s.cameraId);
    wrap.append(h('div', { class: 'rowitem' },
      h('div', { class: 'ic', html: ico('user', 18) }),
      h('div', { class: 'grow' }, h('b', {}, s.email), h('small', {}, `${cam?.name || '—'} · ${ROLES[s.role]?.name || s.role}`)),
      h('button', {
        class: 'iconbtn plain', html: ico('trash', 18), onclick: e => {
          S.shares = S.shares.filter(x => x.id !== s.id); save('shares');
          e.target.closest('.rowitem').remove(); toast("Bekor qilindi");
        }
      })));
  });
  return wrap;
});

/* --- Xavfsizlik --- */
route('/settings/security', () => {
  const st = S.settings;
  const wrap = h('div', { class: 'screen' }, topbar('Xavfsizlik'));
  wrap.append(
    toggleRow('Ikki bosqichli tasdiqlash (2FA)', 'TOTP ilova orqali', !!st.twofa, async v => {
      st.twofa = v; save('settings');
      if (v) {
        let secret = 'JBSWY3DPEHPK3PXP';
        if (api.enabled) { try { secret = (await api.post('/auth/2fa/enable', {})).secret; } catch (e) { toast(e.message, 'err'); } }
        sheet('2FA yoqish', h('div', {},
          h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Google Authenticator yoki shunga oʻxshash ilovaga quyidagi kalitni kiriting:'),
          h('div', { class: 'card mono', style: { textAlign: 'center', fontSize: '16px', letterSpacing: '2px' } }, secret),
          h('button', { class: 'btn', style: { marginTop: '12px' }, onclick: closeSheet }, 'Tayyor')));
      }
    }, 'shield'),
    toggleRow('Ilovaga kirishda PIN', 'Har safar ochilganda soʻraladi', !!st.pinLock, v => { st.pinLock = v; save('settings'); }, 'key'),
    navRow('Faol seanslar', 'Qurilmalar roʻyxati', 'user', () => sessionsSheet()),
    navRow('Audit log', `${S.audit.length} ta yozuv`, 'list', () => go('/admin/logs')),
    h('div', { class: 'card', style: { marginTop: '14px' } },
      h('b', { style: { fontSize: '13px' } }, 'Ulanish xavfsizligi'),
      h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } },
        `Transport: ${location.protocol === 'https:' ? 'HTTPS/TLS ✓' : 'HTTP ⚠️'} · Token: JWT + refresh · Parollar serverda saqlanadi (Argon2). Kamera parollari qurilmada faqat demo rejimda saqlanadi.`)));
  return wrap;
});
function sessionsSheet() {
  const list = [
    { d: navigator.userAgent.includes('Android') ? 'Android qurilma' : navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Brauzer', t: Date.now(), cur: true },
    { d: 'Chrome — Windows', t: Date.now() - 3 * 864e5 },
  ];
  sheet('Faol seanslar', h('div', {}, ...list.map(s => h('div', { class: 'rowitem' },
    h('div', { class: 'ic', html: ico('user', 18) }),
    h('div', { class: 'grow' }, h('b', {}, s.d), h('small', {}, s.cur ? 'Joriy seans' : timeAgo(s.t))),
    s.cur ? null : h('button', { class: 'btn sm sec', onclick: e => { e.target.closest('.rowitem').remove(); toast('Seans yopildi'); } }, 'Yopish')))));
}

/* --- Obuna --- */
route('/subscription', () => {
  const cur = S.user?.plan || 'free';
  const feats = {
    free: ['2 ta kamera', 'SD sifat', '7 kun tarix', 'Harakat aniqlash'],
    pro: ['20 ta kamera', 'Full HD', 'AI aniqlash (odam/avto/hayvon)', 'Cloud Backup', '30 kun tarix'],
    business: ['Cheksiz kamera', '4K sifat', 'AI + hisobotlar', 'Koʻp foydalanuvchi', '90 kun tarix', 'Ustuvor qoʻllab-quvvatlash'],
    enterprise: ['Cheksiz foydalanuvchi', 'Klaster server', 'Ajratilgan xotira', 'API kirish', 'SLA shartnoma'],
  };
  return h('div', { class: 'screen' },
    topbar('Obuna', { sub: 'Joriy: ' + PLANS[cur].name }),
    ...Object.entries(PLANS).map(([k, p]) => h('div', { class: 'plan' + (k === cur ? ' on' : '') },
      h('div', { class: 'row between' },
        h('div', {}, h('b', { style: { fontSize: '17px' } }, p.name),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, `${p.cams === Infinity ? 'Cheksiz' : p.cams} kamera · ${p.quality} · ${p.days} kun`)),
        h('div', { style: { textAlign: 'right' } }, h('div', { class: 'price' }, p.price === '0' ? 'Bepul' : p.price),
          p.price !== '0' && p.price !== 'Kelishilgan' ? h('div', { class: 'muted', style: { fontSize: '11px' } }, "so'm / oy") : null)),
      h('ul', {}, ...feats[k].map(f => h('li', {}, f))),
      k === cur ? h('button', { class: 'btn sec', style: { marginTop: '12px' }, disabled: true }, 'Joriy tarif')
        : h('button', {
          class: 'btn', style: { marginTop: '12px' }, onclick: async () => {
            if (k === 'enterprise') return toast('Savdo boʻlimi bilan bogʻlaning: sales@itcode.uz');
            if (api.enabled) {
              try { const r = await api.post('/billing/checkout', { plan: k }); if (r.url) return location.assign(r.url); } catch (e) { return toast(e.message, 'err'); }
            }
            S.user = { ...S.user, plan: k }; save('user'); toast(PLANS[k].name + ' tarifi yoqildi', 'ok'); go('/subscription');
          }
        }, k === 'enterprise' ? "Bogʻlanish" : 'Tanlash'))),
    h('p', { class: 'muted', style: { fontSize: '12px', textAlign: 'center' } }, "Toʻlov Payme, Click va bank kartalari orqali. Istalgan vaqtda bekor qilish mumkin."));
});

/* --- Yordam --- */
route('/help', () => {
  const faq = [
    ['Kamera topilmayapti', 'Kamera va telefon bitta Wi-Fi tarmogʻida ekanini tekshiring. Kamerada ONVIF yoqilgan boʻlishi kerak (kamera veb-panelida Network → Advanced → ONVIF).'],
    ['RTSP manzilini qayerdan olaman?', "Ilovadagi 'RTSP manzil' boʻlimida har bir brend uchun standart yoʻllar keltirilgan. Masalan Hikvision: /Streaming/Channels/101."],
    ['Uzoqdan koʻra olmayapman', 'Kamera lokal tarmoqda boʻlsa, tashqaridan koʻrish uchun server (gateway) kerak. Sozlamalar → Server ulanishi boʻlimida backend manzilini kiriting.'],
    ['V380 / YCC365 nega toʻliq ishlamaydi?', 'Bu kameralar yopiq bulut protokolidan foydalanadi. Faqat ishlab chiqaruvchi RTSP yoki ONVIF ni ochgan boʻlsa ulanadi.'],
    ['Video sifati past', 'Multi-ekran rejimida tejamkor (sub) oqim ishlatiladi. Bitta kameraga oʻtsangiz yuqori sifat yoqiladi.'],
    ['Arxiv qancha saqlanadi?', 'Tarifga bogʻliq: Free — 7 kun, Pro — 30 kun, Business — 90 kun, Enterprise — kelishuv boʻyicha.'],
    ['Push kelmayapti (iPhone)', "PWA ni Safari orqali 'Home Screen'ga qoʻshing va ilovani ochib, Sozlamalar → Bildirishnomalar da ruxsat bering. iOS 16.4+ talab qilinadi."],
  ];
  return h('div', { class: 'screen' }, topbar('Yordam markazi'),
    ...faq.map(([q, a]) => {
      const body = h('p', { class: 'muted', style: { fontSize: '13px', margin: '8px 0 0', display: 'none' } }, a);
      return h('div', { class: 'card', style: { marginBottom: '8px' }, onclick: () => { body.style.display = body.style.display === 'none' ? 'block' : 'none'; } },
        h('div', { class: 'row between' }, h('b', { style: { fontSize: '14px' } }, q), h('span', { class: 'dim', html: ico('chevd', 16) })), body);
    }),
    h('div', { class: 'sec' }, h('h3', {}, 'Bogʻlanish')),
    navRow('Telegram qoʻllab-quvvatlash', '@itcode_support', 'tg', () => open('https://t.me/itcode_support')),
    navRow('Email', 'support@itcode.uz', 'mail', () => open('mailto:support@itcode.uz')));
});

route('/about', () => h('div', { class: 'screen' },
  topbar('Ilova haqida'),
  h('div', { class: 'center', style: { padding: '18px 0' } },
    h('div', { style: { width: '72px', height: '72px', borderRadius: '22px', background: 'linear-gradient(140deg,var(--brand),#7C3AED)', display: 'grid', placeItems: 'center', margin: '0 auto 12px', color: '#fff' }, html: ico('cctv', 36) }),
    h('h2', {}, 'ITCode CCTV'),
    h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Universal CCTV platformasi · v1.0.0')),
  h('div', { class: 'card' },
    h('b', { style: { fontSize: '13px' } }, 'Qoʻllab-quvvatlanadigan kameralar'),
    h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } },
      'Hikvision, Dahua, Uniview, Axis, Reolink, TP-Link VIGI, UniFi Protect, ONVIF · API orqali: Tuya, Smart Life, EZVIZ, IMOU · Cheklangan: V380, iCSee, Yoosee, YCC365')),
  h('div', { class: 'card', style: { marginTop: '10px' } },
    h('b', { style: { fontSize: '13px' } }, 'Texnologiyalar'),
    h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } },
      'PWA (Service Worker, WebRTC/WHEP, HLS) · Android WebView + ONVIF WS-Discovery · Backend: NestJS, PostgreSQL, Redis, MediaMTX, YOLOv11')),
  h('div', { class: 'card', style: { marginTop: '10px' } },
    h('b', { style: { fontSize: '13px' } }, 'Maxfiylik'),
    h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } },
      'Demo rejimda barcha maʼlumot faqat qurilmangizda saqlanadi va hech qayerga yuborilmaydi. Server rejimida video oqim TLS orqali uzatiladi.')),
  h('p', { class: 'dim', style: { textAlign: 'center', fontSize: '12px', marginTop: '20px' } }, '© 2026 ITCode. Barcha huquqlar himoyalangan.')));
