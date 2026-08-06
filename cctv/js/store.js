/* BRILIANT — holat (state) va lokal saqlash */

const K = 'briliant:';

/* localStorage har doim ham mavjud emas (iframe, Safari private, oʻchirilgan cookie).
   Shunday holatda seans davomida ishlaydigan xotira zaxirasiga tushamiz. */
const mem = new Map();
export const lsGet = k => { try { return localStorage.getItem(k); } catch { return mem.has(k) ? mem.get(k) : null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } };

const read = (k, d) => { const v = lsGet(K + k); try { return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => lsSet(K + k, JSON.stringify(v));

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const PLANS = {
  free:       { name: 'Free',       cams: 2,        quality: 'SD',      days: 7,   ai: false, backup: false, price: '0' },
  pro:        { name: 'Pro',        cams: 20,       quality: 'Full HD', days: 30,  ai: true,  backup: true,  price: '99 000' },
  business:   { name: 'Business',   cams: Infinity, quality: '4K',      days: 90,  ai: true,  backup: true,  price: '299 000' },
  enterprise: { name: 'Enterprise', cams: Infinity, quality: '4K',      days: 365, ai: true,  backup: true,  price: 'Kelishilgan' },
};

export const ROLES = {
  owner:    { name: 'Egasi',        can: ['*'] },
  admin:    { name: 'Administrator', can: ['camera.add','camera.edit','camera.delete','user.manage','ptz','playback','share','admin'] },
  operator: { name: 'Operator',     can: ['ptz','playback','share'] },
  viewer:   { name: "Ko'ruvchi",    can: ['playback'] },
};

export const EVENT_TYPES = {
  person:    { name: 'Odam',              icon: 'person' },
  vehicle:   { name: 'Avtomobil',         icon: 'car' },
  animal:    { name: 'Hayvon',            icon: 'paw' },
  face:      { name: 'Yuz',               icon: 'face' },
  motion:    { name: 'Harakat',           icon: 'motion' },
  line:      { name: 'Chegara buzilishi', icon: 'line' },
  intrusion: { name: 'Hududga kirish',    icon: 'zone' },
  fire:      { name: "Yong'in",           icon: 'fire' },
};

/* --- Kuzatiladigan holat --- */
const listeners = new Set();
export const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = (evt = 'change') => listeners.forEach(f => { try { f(evt); } catch (e) { console.error(e); } });

export const S = {
  user:     read('user', null),
  tokens:   read('tokens', null),
  cameras:  read('cameras', []),
  groups:   read('groups', []),
  events:   read('events', []),
  notifs:   read('notifs', []),
  audit:    read('audit', []),
  shares:   read('shares', []),
  servers:  read('servers', []),
  settings: read('settings', {
    theme: 'dark',
    demo: true,
    apiBase: '',
    push: true, email: false, telegram: false,
    telegramChat: '',
    aiPerson: true, aiVehicle: true, aiAnimal: false, aiFace: false,
    motionSens: 60,
    quietFrom: '', quietTo: '',
    saveWifiOnly: false,
    hwAccel: true,
    autoRecord: false,
    lastGrid: 4,
  }),
};

export function save(...keys) {
  (keys.length ? keys : ['user','tokens','cameras','groups','events','notifs','audit','shares','servers','settings'])
    .forEach(k => write(k, S[k]));
  emit();
}

export function log(action, meta = {}) {
  S.audit.unshift({ id: uid('lg'), ts: Date.now(), action, meta, user: S.user?.email || 'anonim' });
  S.audit = S.audit.slice(0, 400);
  save('audit');
}

export function notify(title, body, kind = 'info', cameraId = null) {
  S.notifs.unshift({ id: uid('nt'), ts: Date.now(), title, body, kind, cameraId, read: false });
  S.notifs = S.notifs.slice(0, 300);
  save('notifs');
  if (S.settings.push && 'Notification' in window && Notification.permission === 'granted' && !inQuietHours()) {
    try { new Notification(title, { body, icon: './icons/icon-192.png', tag: cameraId || kind }); } catch {}
  }
}

export function inQuietHours() {
  const { quietFrom: a, quietTo: b } = S.settings;
  if (!a || !b) return false;
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number);
  const f = ah * 60 + am, t = bh * 60 + bm;
  return f <= t ? (cur >= f && cur <= t) : (cur >= f || cur <= t);
}

/* --- Ruxsatlar --- */
export const can = perm => {
  const r = ROLES[S.user?.role || 'viewer'];
  return !!r && (r.can.includes('*') || r.can.includes(perm));
};
export const plan = () => PLANS[S.user?.plan || 'free'];
export const camLimitReached = () => S.cameras.length >= plan().cams;

/* --- Kameralar --- */
export function addCamera(cam) {
  const c = {
    id: uid('cam'), name: 'Kamera', brand: 'onvif', model: '', groupId: null,
    method: 'rtsp', host: '', port: 554, username: '', password: '',
    rtspUrl: '', hlsUrl: '', whepUrl: '', snapshotUrl: '',
    channel: 1, substream: true,
    online: true, favorite: false, recording: false,
    ptz: false, audioIn: true, audioOut: false, ir: 'auto', irSupported: true,
    ai: { person: true, vehicle: true, animal: false },
    motion: { enabled: true, sens: 60 },
    lat: null, lng: null,
    resolution: '1920x1080', fps: 20, codec: 'H.264',
    createdAt: Date.now(), lastSeen: Date.now(),
    ...cam,
  };
  S.cameras.push(c);
  save('cameras');
  log('camera.add', { id: c.id, name: c.name, brand: c.brand });
  return c;
}
export const getCam = id => S.cameras.find(c => c.id === id);
export function updateCamera(id, patch) {
  const c = getCam(id); if (!c) return null;
  Object.assign(c, patch); save('cameras'); log('camera.edit', { id, keys: Object.keys(patch) });
  return c;
}
export function removeCamera(id) {
  const c = getCam(id);
  S.cameras = S.cameras.filter(x => x.id !== id);
  S.events = S.events.filter(e => e.cameraId !== id);
  save('cameras', 'events'); log('camera.delete', { id, name: c?.name });
}

/* --- Guruhlar --- */
export function addGroup(name, color = '#2E8FFF') {
  const g = { id: uid('grp'), name, color };
  S.groups.push(g); save('groups'); return g;
}

/* --- Hodisalar --- */
export function addEvent(cameraId, type, extra = {}) {
  const ev = {
    id: uid('ev'), cameraId, type, ts: Date.now(),
    confidence: 0.7 + Math.random() * 0.29, seen: false, clip: null,
    ...extra,
  };
  S.events.unshift(ev);
  S.events = S.events.slice(0, 500);
  save('events');
  return ev;
}

/* --- Demo ma'lumotlar --- */
const DEMO_CAMS = [
  { name: 'Kirish darvozasi', brand: 'hikvision', model: 'DS-2CD2143G2', host: '192.168.1.64', ptz: false, lat: 41.3111, lng: 69.2797, tag: 'gate' },
  { name: 'Hovli — PTZ',      brand: 'dahua',     model: 'SD49225XA',     host: '192.168.1.65', ptz: true,  audioOut: true, lat: 41.3125, lng: 69.2810, tag: 'yard' },
  { name: 'Avtoturargoh',     brand: 'uniview',   model: 'IPC2124SR3',    host: '192.168.1.66', ptz: false, lat: 41.3098, lng: 69.2775, tag: 'park' },
  { name: 'Ombor',            brand: 'reolink',   model: 'RLC-810A',      host: '192.168.1.67', ptz: false, lat: 41.3140, lng: 69.2760, tag: 'store' },
  { name: 'Koridor',          brand: 'tplink',    model: 'VIGI C340',     host: '192.168.1.68', ptz: false, online: false, tag: 'hall' },
  { name: 'Orqa eshik',       brand: 'ezviz',     model: 'C3W',           host: '192.168.1.69', ptz: false, audioOut: true, lat: 41.3105, lng: 69.2828, tag: 'back' },
];

export function seedDemo(force = false) {
  if (S.cameras.length && !force) return;
  S.groups = [
    { id: 'grp_out', name: "Tashqi hudud", color: '#2E8FFF' },
    { id: 'grp_in',  name: 'Ichki hudud',  color: '#A855F7' },
  ];
  S.cameras = DEMO_CAMS.map((d, i) => ({
    id: 'cam_demo' + i, name: d.name, brand: d.brand, model: d.model, method: 'ip',
    host: d.host, port: 554, username: 'admin', password: '••••••',
    rtspUrl: '', hlsUrl: '', whepUrl: '', snapshotUrl: '',
    groupId: i % 2 ? 'grp_in' : 'grp_out',
    online: d.online !== false, favorite: i < 2, recording: i < 3,
    ptz: !!d.ptz, audioIn: true, audioOut: !!d.audioOut, ir: 'auto', irSupported: true,
    ai: { person: true, vehicle: i < 3, animal: i === 3 },
    motion: { enabled: true, sens: 60 },
    lat: d.lat ?? null, lng: d.lng ?? null, demoTag: d.tag,
    resolution: i % 3 === 0 ? '2560x1440' : '1920x1080', fps: 20, codec: 'H.264',
    createdAt: Date.now() - i * 864e5, lastSeen: Date.now(),
  }));
  S.servers = [
    { id: 'srv1', name: 'stream-01 (Toshkent)', role: 'MediaMTX', cpu: 38, ram: 54, streams: 12, up: '18 kun', status: 'ok' },
    { id: 'srv2', name: 'ai-01 (Toshkent)',     role: 'YOLOv11',  cpu: 71, ram: 63, streams: 6,  up: '9 kun',  status: 'ok' },
    { id: 'srv3', name: 'storage-01 (MinIO)',   role: 'Storage',  cpu: 12, ram: 31, streams: 0,  up: '42 kun', status: 'ok' },
  ];
  const types = ['person', 'vehicle', 'person', 'motion', 'animal', 'person', 'line', 'vehicle'];
  S.events = Array.from({ length: 24 }, (_, i) => ({
    id: 'ev_demo' + i,
    cameraId: S.cameras[i % 4].id,
    type: types[i % types.length],
    ts: Date.now() - i * 37 * 60000 - Math.floor(Math.random() * 9e5),
    confidence: 0.72 + Math.random() * 0.27,
    seen: i > 5, clip: null,
  }));
  S.notifs = [
    { id: 'nt1', ts: Date.now() - 12 * 60000, title: 'Odam aniqlandi', body: 'Kirish darvozasi — 1 kishi', kind: 'ai', cameraId: 'cam_demo0', read: false },
    { id: 'nt2', ts: Date.now() - 96 * 60000, title: 'Kamera oflayn', body: 'Koridor — ulanish uzildi', kind: 'offline', cameraId: 'cam_demo4', read: false },
    { id: 'nt3', ts: Date.now() - 5 * 36e5, title: 'Avtomobil aniqlandi', body: 'Avtoturargoh — 1 avtomobil', kind: 'ai', cameraId: 'cam_demo2', read: true },
  ];
  S.shares = [
    { id: 'sh1', cameraId: 'cam_demo0', email: 'oila@example.com', role: 'viewer', expires: null },
  ];
  save();
}

export function resetAll() {
  ['user','tokens','cameras','groups','events','notifs','audit','shares','servers']
    .forEach(k => { S[k] = Array.isArray(S[k]) ? [] : null; });
  save();
}

/* --- Mahalliy foydalanuvchilar (demo rejim autentifikatsiyasi) --- */
export const localUsers = () => read('users', []);
export function localRegister(name, email, password) {
  const users = localUsers();
  if (users.some(u => u.email === email.toLowerCase())) throw new Error('Bu email allaqachon roʻyxatdan oʻtgan');
  const u = { id: uid('usr'), name, email: email.toLowerCase(), pass: hash(password), role: 'owner', plan: 'free', createdAt: Date.now() };
  users.push(u); write('users', users);
  return u;
}
export function localLogin(email, password) {
  const u = localUsers().find(x => x.email === email.toLowerCase());
  if (!u || u.pass !== hash(password)) throw new Error("Email yoki parol notoʻgʻri");
  return u;
}
/* Demo rejim uchun oddiy xesh — faqat lokal qurilmada, serverga uzatilmaydi */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/* --- Formatlash yordamchilari --- */
export const pad = n => String(n).padStart(2, '0');
export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'hozir';
  if (s < 3600) return Math.floor(s / 60) + ' daq oldin';
  if (s < 86400) return Math.floor(s / 3600) + ' soat oldin';
  if (s < 604800) return Math.floor(s / 86400) + ' kun oldin';
  return new Date(ts).toLocaleDateString('uz-UZ');
}
export const clock = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const dateStr = ts => { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
