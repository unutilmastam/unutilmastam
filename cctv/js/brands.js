/* BRILIANT — brendlar, RTSP shablonlari va ONVIF aniqlash */

/**
 * support: full   — RTSP/ONVIF toʻliq, PTZ, audio, hodisalar
 *          api    — ishlab chiqaruvchi Cloud API orqali
 *          limited — yopiq bulut; faqat RTSP/ONVIF ochiq boʻlsa ishlaydi
 * main/sub — asosiy va qoʻshimcha oqim yoʻllari ({ch} = kanal raqami)
 */
export const BRANDS = {
  hikvision: {
    name: 'Hikvision', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/Streaming/Channels/{ch}01', sub: '/Streaming/Channels/{ch}02',
    snapshot: '/ISAPI/Streaming/channels/{ch}01/picture', color: '#E4002B',
  },
  dahua: {
    name: 'Dahua', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/cam/realmonitor?channel={ch}&subtype=0', sub: '/cam/realmonitor?channel={ch}&subtype=1',
    snapshot: '/cgi-bin/snapshot.cgi?channel={ch}', color: '#0072CE',
  },
  uniview: {
    name: 'Uniview', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/media/video{ch}', sub: '/media/video{ch}_sub',
    snapshot: '/images/snapshot.jpg', color: '#00A0E9',
  },
  axis: {
    name: 'Axis', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'root',
    main: '/axis-media/media.amp?camera={ch}', sub: '/axis-media/media.amp?camera={ch}&resolution=640x360',
    snapshot: '/axis-cgi/jpg/image.cgi', color: '#FFCC00',
  },
  reolink: {
    name: 'Reolink', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/h264Preview_0{ch}_main', sub: '/h264Preview_0{ch}_sub',
    snapshot: '/cgi-bin/api.cgi?cmd=Snap&channel=0', color: '#1F6FEB',
  },
  tplink: {
    name: 'TP-Link VIGI', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/stream{ch}', sub: '/stream2',
    snapshot: '', color: '#4ACBD6',
  },
  unifi: {
    name: 'UniFi Protect', support: 'full', port: 7441, httpPort: 443, onvif: false, ptz: true, defUser: '',
    main: '/{key}', sub: '/{key}', scheme: 'rtsps', note: 'Protect ilovasida RTSPS yoqilib, kanal kaliti olinadi',
    snapshot: '', color: '#0559C9',
  },
  onvif: {
    name: 'ONVIF (universal)', support: 'full', port: 554, httpPort: 80, onvif: true, ptz: true, defUser: 'admin',
    main: '/onvif{ch}', sub: '/onvif{ch}_sub', snapshot: '', color: '#6B7A90',
  },
  tuya: {
    name: 'Tuya', support: 'api', cloud: 'tuya', port: 554, onvif: false, ptz: true, defUser: '',
    main: '', sub: '', note: 'Tuya IoT Cloud loyihasi kerak (Client ID / Secret)', color: '#FF4800',
  },
  smartlife: {
    name: 'Smart Life', support: 'api', cloud: 'tuya', port: 554, onvif: false, ptz: true, defUser: '',
    main: '', sub: '', note: 'Tuya bulutining oʻsha API si', color: '#FF6B2C',
  },
  ezviz: {
    name: 'EZVIZ', support: 'api', cloud: 'ezviz', port: 554, onvif: false, ptz: true, defUser: 'admin',
    main: '/H.264', sub: '/H.264/sub', note: 'RTSP paroli — qurilma yorligʻidagi tekshiruv kodi', color: '#0080FF',
  },
  imou: {
    name: 'IMOU', support: 'api', cloud: 'imou', port: 554, onvif: false, ptz: true, defUser: 'admin',
    main: '/cam/realmonitor?channel={ch}&subtype=0', sub: '/cam/realmonitor?channel={ch}&subtype=1',
    note: 'Ilovada RTSP yoqilishi shart', color: '#FF7A00',
  },
  v380: {
    name: 'V380 Pro', support: 'limited', port: 554, onvif: false, ptz: true, defUser: 'admin',
    main: '/live/ch00_0', sub: '/live/ch00_1', note: 'Yopiq bulut. RTSP koʻpincha faqat lokal tarmoqda', color: '#8A94A6',
  },
  icsee: {
    name: 'iCSee / XMEye', support: 'limited', port: 554, onvif: true, ptz: true, defUser: 'admin',
    main: '/user={u}&password={p}&channel={ch}&stream=0.sdp', sub: '/user={u}&password={p}&channel={ch}&stream=1.sdp',
    note: 'ONVIF yoqilgan boʻlsa universal ishlaydi', color: '#8A94A6',
  },
  yoosee: {
    name: 'Yoosee', support: 'limited', port: 554, onvif: false, ptz: true, defUser: 'admin',
    main: '/onvif1', sub: '/onvif2', note: 'Faqat lokal RTSP; bulut yopiq', color: '#8A94A6',
  },
  ycc365: {
    name: 'YCC365 / CloudEdge', support: 'limited', port: 554, onvif: false, ptz: true, defUser: 'admin',
    main: '/live', sub: '/live/sub', note: 'Koʻp modellarda RTSP oʻchirilgan', color: '#8A94A6',
  },
  custom: {
    name: 'Boshqa / qoʻlda', support: 'full', port: 554, onvif: false, ptz: false, defUser: '',
    main: '', sub: '', color: '#6B7A90',
  },
};

export const brandOf = k => BRANDS[k] || BRANDS.custom;

/** Kamera obyektidan RTSP manzilini yigʻish */
export function buildRtsp(cam, { sub = false, hidePass = false } = {}) {
  if (cam.rtspUrl) return hidePass ? cam.rtspUrl.replace(/:\/\/([^:]+):[^@]+@/, '://$1:••••@') : cam.rtspUrl;
  const b = brandOf(cam.brand);
  const path = (sub ? b.sub : b.main) || '';
  if (!path) return '';
  const ch = cam.channel || 1;
  const u = encodeURIComponent(cam.username || '');
  const p = hidePass ? '••••' : encodeURIComponent(cam.password || '');
  const auth = u ? `${u}:${p}@` : '';
  const scheme = b.scheme || 'rtsp';
  const port = cam.port || b.port || 554;
  const tail = path.replace(/\{ch\}/g, ch).replace(/\{u\}/g, u).replace(/\{p\}/g, p).replace(/\{key\}/g, cam.streamKey || '');
  return `${scheme}://${auth}${cam.host}:${port}${tail}`;
}

export function buildSnapshot(cam) {
  if (cam.snapshotUrl) return cam.snapshotUrl;
  const b = brandOf(cam.brand);
  if (!b.snapshot || !cam.host) return '';
  return `http://${cam.host}:${b.httpPort || 80}${b.snapshot.replace(/\{ch\}/g, cam.channel || 1)}`;
}

/* ---------- ONVIF aniqlash ----------
 * Brauzer UDP multicast yubora olmaydi. Shuning uchun uch manba:
 *  1. Android ilova koʻprigi (window.BRILIANT.discoverOnvif) — WS-Discovery to'g'ridan-to'g'ri telefondan
 *  2. Backend `/cameras/discover` — server lokal tarmoqda boʻlsa
 *  3. Demo natijalar
 */
export const hasNativeBridge = () => typeof window.BRILIANT?.discoverOnvif === 'function';

export async function discoverOnvif({ api = null, timeout = 6000 } = {}) {
  if (hasNativeBridge()) {
    const raw = await nativeDiscover(timeout);
    return raw.map(normalizeDevice);
  }
  if (api?.enabled) {
    try {
      const r = await api.get('/cameras/discover', { timeout: timeout + 2000 });
      return (r.devices || []).map(normalizeDevice);
    } catch (e) { console.warn('discover API:', e.message); }
  }
  await new Promise(r => setTimeout(r, 1400));
  return demoDevices();
}

function nativeDiscover(timeout) {
  return new Promise(resolve => {
    const cbName = '__onvif_' + Date.now().toString(36);
    const done = list => { delete window[cbName]; resolve(list || []); };
    window[cbName] = json => { try { done(JSON.parse(json)); } catch { done([]); } };
    setTimeout(() => window[cbName] && done([]), timeout + 1500);
    try { window.BRILIANT.discoverOnvif(cbName, timeout); } catch { done([]); }
  });
}

function normalizeDevice(d) {
  const host = d.host || (d.xaddr || '').replace(/^https?:\/\//, '').split(/[:/]/)[0];
  const name = d.name || d.model || 'ONVIF qurilma';
  return {
    host, name,
    xaddr: d.xaddr || '',
    brand: guessBrand(`${d.name || ''} ${d.model || ''} ${d.scopes || ''}`),
    mac: d.mac || '', model: d.model || '',
  };
}

function guessBrand(text) {
  const t = (text || '').toLowerCase();
  const map = [
    ['hikvision', 'hikvision'], ['hik', 'hikvision'], ['dahua', 'dahua'], ['amcrest', 'dahua'],
    ['uniview', 'uniview'], ['unv', 'uniview'], ['axis', 'axis'], ['reolink', 'reolink'],
    ['tp-link', 'tplink'], ['vigi', 'tplink'], ['ubiquiti', 'unifi'], ['unifi', 'unifi'],
    ['ezviz', 'ezviz'], ['imou', 'imou'], ['xm', 'icsee'], ['icsee', 'icsee'],
  ];
  for (const [k, v] of map) if (t.includes(k)) return v;
  return 'onvif';
}

function demoDevices() {
  return [
    { host: '192.168.1.64', name: 'HIKVISION DS-2CD2143G2-I', brand: 'hikvision', xaddr: 'http://192.168.1.64/onvif/device_service', model: 'DS-2CD2143G2-I' },
    { host: '192.168.1.65', name: 'Dahua SD49225XA-HNR', brand: 'dahua', xaddr: 'http://192.168.1.65/onvif/device_service', model: 'SD49225XA' },
    { host: '192.168.1.72', name: 'IPC-Camera (ONVIF)', brand: 'onvif', xaddr: 'http://192.168.1.72:8899/onvif/device_service', model: 'IPC' },
  ];
}

/** QR matnidan kamera maʼlumotlarini ajratish */
export function parseCameraQR(text) {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^rtsps?:\/\//i.test(t)) {
    try {
      const u = new URL(t.replace(/^rtsps?:/i, 'http:'));
      return { method: 'rtsp', rtspUrl: t, host: u.hostname, port: +u.port || 554, username: decodeURIComponent(u.username || ''), password: decodeURIComponent(u.password || ''), name: u.hostname };
    } catch { return { method: 'rtsp', rtspUrl: t, name: 'RTSP kamera' }; }
  }
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      return { method: j.rtsp ? 'rtsp' : 'ip', name: j.name || j.model || 'Kamera', brand: (j.brand || 'onvif').toLowerCase(),
        host: j.ip || j.host || '', port: +j.port || 554, username: j.user || j.username || '', password: j.pass || j.password || '',
        rtspUrl: j.rtsp || '', serial: j.sn || j.serial || '' };
    } catch { /* pastga tushadi */ }
  }
  // Hikvision/EZVIZ yorligʻi: "SN:DS-2CD... CODE:ABCDEF"
  const sn = t.match(/(?:SN|S\/N)[:\s]*([A-Za-z0-9-]+)/i);
  const code = t.match(/(?:CODE|VC)[:\s]*([A-Z0-9]+)/i);
  if (sn) return { method: 'cloud', serial: sn[1], verifyCode: code?.[1] || '', name: sn[1], brand: /ezviz/i.test(t) ? 'ezviz' : 'hikvision' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return { method: 'ip', host: t, name: t, brand: 'onvif' };
  return null;
}
