/* BRILIANT — pleyer: WebRTC (WHEP), HLS, MJPEG/snapshot va demo generator */
import { S, addEvent, notify, getCam } from './store.js';

/* --------- Umumiy rAF halqasi: barcha tayler bitta sikldan yangilanadi --------- */
const renderers = new Set();
let loopOn = false;
function loop(t) {
  if (!renderers.size) { loopOn = false; return; }
  renderers.forEach(r => { try { r.tick(t); } catch (e) { console.error(e); } });
  requestAnimationFrame(loop);
}
function startLoop() { if (!loopOn) { loopOn = true; requestAnimationFrame(loop); } }

const HLS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js';
let hlsPromise = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsPromise) hlsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = HLS_CDN; s.onload = () => res(window.Hls); s.onerror = () => rej(new Error('hls.js yuklanmadi'));
    document.head.appendChild(s);
  });
  return hlsPromise;
}

/** Kamera uchun qaysi manba ishlatilishini aniqlash */
export function sourceOf(cam) {
  if (S.settings.demo || (!cam.whepUrl && !cam.hlsUrl && !cam.snapshotUrl && !S.settings.apiBase)) return 'demo';
  if (cam.whepUrl) return 'whep';
  if (cam.hlsUrl) return 'hls';
  if (cam.snapshotUrl) return 'mjpeg';
  return 'gateway'; // backend RTSP → HLS/WebRTC ga aylantiradi
}

/**
 * Pleyer yaratish.
 * @param {HTMLElement} box  — konteyner (ichi tozalanadi)
 * @param {object} cam
 * @param {{quality?:'main'|'sub', fps?:number, muted?:boolean, onEvent?:Function, hud?:boolean}} opt
 */
export function createPlayer(box, cam, opt = {}) {
  const o = { quality: 'sub', fps: 14, muted: true, hud: true, ...opt };
  box.innerHTML = '';
  const src = sourceOf(cam);
  const p = src === 'demo' ? new DemoPlayer(box, cam, o) : new NetPlayer(box, cam, o, src);
  return p;
}

/* =========================================================================
 * Tarmoq pleyeri — WebRTC/HLS/MJPEG
 * ========================================================================= */
class NetPlayer {
  constructor(box, cam, o, src) {
    this.box = box; this.cam = cam; this.o = o; this.src = src; this.dead = false;
    this.el = document.createElement('video');
    Object.assign(this.el, { autoplay: true, playsInline: true, muted: o.muted, controls: false });
    this.el.setAttribute('playsinline', ''); this.el.setAttribute('webkit-playsinline', '');
    box.appendChild(this.el);
    this.start();
  }
  async start() {
    try {
      if (this.src === 'whep' || this.src === 'gateway') await this.startWhep();
      else if (this.src === 'hls') await this.startHls();
      else this.startMjpeg();
    } catch (e) {
      console.warn('[player]', e.message);
      if (this.src !== 'hls' && this.cam.hlsUrl) { this.src = 'hls'; return this.start(); }
      this.fail(e.message);
    }
  }
  async urls() {
    if (this.cam.whepUrl || this.cam.hlsUrl) return { whep: this.cam.whepUrl, hls: this.cam.hlsUrl };
    const { api } = await import('./api.js');
    const r = await api.streamUrls(this.cam.id);
    return { whep: r.webrtc || r.whep, hls: r.hls };
  }
  async startWhep() {
    const { whep, hls } = await this.urls();
    if (!whep) { if (hls) { this.cam.hlsUrl = hls; this.src = 'hls'; return this.startHls(); } throw new Error('WebRTC manzili yoʻq'); }
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const stream = new MediaStream();
    pc.ontrack = e => { stream.addTrack(e.track); this.el.srcObject = stream; };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState) && !this.dead) this.retry();
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise(r => {
      if (pc.iceGatheringState === 'complete') return r();
      const to = setTimeout(r, 1200);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); r(); } };
    });
    const res = await fetch(whep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', ...(S.tokens?.access ? { Authorization: 'Bearer ' + S.tokens.access } : {}) },
      body: pc.localDescription.sdp,
    });
    if (!res.ok) throw new Error('WHEP xato: ' + res.status);
    this.whepLoc = res.headers.get('Location');
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
  }
  async startHls() {
    const { hls } = await this.urls();
    if (!hls) throw new Error('HLS manzili yoʻq');
    if (this.el.canPlayType('application/vnd.apple.mpegurl')) { this.el.src = hls; return; } // iOS Safari
    const Hls = await loadHls();
    if (!Hls.isSupported()) throw new Error('HLS qoʻllab-quvvatlanmaydi');
    this.hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, maxBufferLength: 6 });
    this.hls.loadSource(hls); this.hls.attachMedia(this.el);
    this.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && !this.dead) this.retry(); });
  }
  startMjpeg() {
    this.el.remove();
    const img = document.createElement('img');
    this.img = img; this.box.appendChild(img);
    const url = this.cam.snapshotUrl;
    const tickMs = 1000 / Math.min(this.o.fps, 4);
    this.iv = setInterval(() => { img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(); }, tickMs);
    img.src = url;
  }
  retry() {
    clearTimeout(this._r);
    this._r = setTimeout(() => { if (!this.dead) { this.stop(true); this.start(); } }, 3000);
  }
  fail(msg) {
    const v = document.createElement('div');
    v.className = 'offline-veil';
    v.innerHTML = `<div>⚠️<br>${msg || 'Oqim mavjud emas'}</div>`;
    this.box.appendChild(v);
  }
  setMuted(m) { this.el && (this.el.muted = m); }
  get videoEl() { return this.el; }
  async snapshot() {
    const c = document.createElement('canvas');
    c.width = this.el.videoWidth || 1280; c.height = this.el.videoHeight || 720;
    c.getContext('2d').drawImage(this.el, 0, 0, c.width, c.height);
    return c;
  }
  captureStream() { return this.el.captureStream ? this.el.captureStream() : null; }
  stop(soft) {
    if (!soft) this.dead = true;
    clearInterval(this.iv); clearTimeout(this._r);
    try { this.hls?.destroy(); } catch {} this.hls = null;
    try { this.pc?.close(); } catch {} this.pc = null;
    if (this.whepLoc) { fetch(this.whepLoc, { method: 'DELETE' }).catch(() => {}); this.whepLoc = null; }
    if (this.el) { this.el.srcObject = null; this.el.removeAttribute('src'); }
  }
}

/* =========================================================================
 * Demo pleyer — kamera oqimini canvas'da sintez qiladi.
 * Backend ulanmagan holatda ham butun ilova tirik ishlaydi.
 * ========================================================================= */
const SCENES = {
  gate:  { sky: ['#16324F', '#0B1622'], ground: '#151C26', road: true,  actors: ['person', 'vehicle'] },
  yard:  { sky: ['#1B3A2E', '#0A1512'], ground: '#12201A', road: false, actors: ['person', 'animal'] },
  park:  { sky: ['#2A2340', '#0D0B16'], ground: '#171522', road: true,  actors: ['vehicle', 'vehicle', 'person'] },
  store: { sky: ['#2E2A1F', '#12100B'], ground: '#1A1712', road: false, actors: ['person'] },
  hall:  { sky: ['#1E2733', '#0A0E14'], ground: '#141A22', road: false, actors: ['person'] },
  back:  { sky: ['#221E2E', '#0B0A11'], ground: '#161320', road: false, actors: ['person', 'animal'] },
};

class DemoPlayer {
  constructor(box, cam, o) {
    this.cam = cam; this.o = o; this.box = box; this.dead = false;
    const c = document.createElement('canvas');
    this.cvs = c; this.ctx = c.getContext('2d', { alpha: false });
    box.appendChild(c);
    this.resize();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(box);
    this.scene = SCENES[cam.demoTag] || SCENES.gate;
    this.seed = [...cam.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    this.actors = [];
    this.last = 0; this.frameMs = 1000 / (o.fps || 14);
    this.nextSpawn = performance.now() + 1200 + (this.seed % 5) * 900;
    this.lastEvent = 0;
    this.muted = o.muted;
    if (cam.online) { renderers.add(this); startLoop(); }
    else this.drawOffline();
  }
  resize() {
    const r = this.box.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cvs.width = Math.max(160, Math.round(r.width * dpr));
    this.cvs.height = Math.max(90, Math.round((r.height || r.width * 9 / 16) * dpr));
    this.W = this.cvs.width; this.H = this.cvs.height;
  }
  night() {
    const h = new Date().getHours();
    return this.cam.ir === 'on' || (this.cam.ir === 'auto' && (h >= 19 || h < 6));
  }
  tick(t) {
    if (this.dead || t - this.last < this.frameMs) return;
    this.last = t;
    this.spawn(t);
    this.draw(t);
  }
  spawn(t) {
    if (t < this.nextSpawn || this.actors.length > 2) return;
    const kinds = this.scene.actors;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const dir = Math.random() > .5 ? 1 : -1;
    this.actors.push({
      kind, dir, x: dir > 0 ? -0.15 : 1.15,
      y: kind === 'vehicle' ? 0.70 : 0.62 + Math.random() * 0.12,
      sp: (kind === 'vehicle' ? 0.16 : 0.055) * (0.8 + Math.random() * 0.5),
      scale: kind === 'vehicle' ? 1 : 0.75 + Math.random() * 0.4,
      born: t, fired: false, ph: Math.random() * 6,
    });
    this.nextSpawn = t + 5000 + Math.random() * 11000;
  }
  draw(t) {
    const { ctx: x, W, H } = this;
    const night = this.night();
    const dt = 1 / (1000 / this.frameMs);

    // Osmon / fon
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this.scene.sky[0]); g.addColorStop(1, this.scene.sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // Ufq va yer
    const hor = H * 0.52;
    x.fillStyle = this.scene.ground; x.fillRect(0, hor, W, H - hor);
    if (this.scene.road) {
      x.fillStyle = 'rgba(255,255,255,.05)';
      x.beginPath(); x.moveTo(W * .18, H); x.lineTo(W * .42, hor); x.lineTo(W * .62, hor); x.lineTo(W * .95, H); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = Math.max(1, W / 320); x.setLineDash([W / 26, W / 20]);
      x.beginPath(); x.moveTo(W * .58, H); x.lineTo(W * .52, hor); x.stroke(); x.setLineDash([]);
    } else {
      x.fillStyle = 'rgba(255,255,255,.035)';
      for (let i = 0; i < 4; i++) x.fillRect(W * (.08 + i * .23), hor - H * .1, W * .12, H * .1);
    }
    // Ufq chizigʻi va devor
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, hor - H * .06, W, H * .06);
    this.drawProps(hor);

    // Aktyorlar
    for (const a of this.actors) {
      a.x += a.dir * a.sp * dt;
      this.drawActor(a, t, hor, night);
      if (!a.fired && a.x > 0.28 && a.x < 0.72) { a.fired = true; this.fireEvent(a); }
    }
    this.actors = this.actors.filter(a => a.x > -0.3 && a.x < 1.3);

    // Kecha rejimi (IR)
    if (night) {
      const d = x.getImageData(0, 0, W, H), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const v = (p[i] * .3 + p[i + 1] * .6 + p[i + 2] * .1) * 1.25;
        p[i] = p[i + 1] = p[i + 2] = Math.min(255, v);
      }
      x.putImageData(d, 0, 0);
      const vg = x.createRadialGradient(W / 2, H / 2, H * .2, W / 2, H / 2, H * .85);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
    }

    // Shovqin (sensor grain)
    const n = Math.floor(W * H / 900);
    x.fillStyle = night ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.03)';
    for (let i = 0; i < n; i++) x.fillRect(Math.random() * W, Math.random() * H, 1, 1);

    if (this.o.hud) this.drawHud(t, night);
  }
  /** Sahnaning statik elementlari — devor, ustunlar, daraxt, javon */
  drawProps(hor) {
    const { ctx: x, W, H } = this;
    const tag = this.cam.demoTag || 'gate';
    x.save();
    if (tag === 'gate' || tag === 'park') {
      // panjara ustunlari
      x.fillStyle = 'rgba(255,255,255,.07)';
      for (let i = 0; i < 7; i++) x.fillRect(W * (.02 + i * .16), hor - H * .22, W * .012, H * .22);
      x.fillRect(0, hor - H * .2, W, H * .012);
      // darvoza
      x.fillStyle = 'rgba(255,255,255,.05)';
      x.fillRect(W * .06, hor - H * .26, W * .16, H * .26);
    } else if (tag === 'yard' || tag === 'back') {
      // daraxtlar
      for (let i = 0; i < 3; i++) {
        const px = W * (.12 + i * .33) + (this.seed % 17) * 2;
        x.fillStyle = 'rgba(255,255,255,.05)';
        x.beginPath(); x.arc(px, hor - H * .18, H * .11, 0, 7); x.fill();
        x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(px - W * .008, hor - H * .1, W * .016, H * .1);
      }
    } else if (tag === 'store') {
      // javonlar
      x.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < 3; i++) x.fillRect(W * .04, hor - H * (.3 - i * .09), W * .92, H * .014);
      for (let i = 0; i < 6; i++) x.fillRect(W * (.08 + i * .15), hor - H * .28, W * .07, H * .06);
    } else {
      // koridor: eshiklar va chiroqlar
      x.fillStyle = 'rgba(255,255,255,.055)';
      for (let i = 0; i < 3; i++) x.fillRect(W * (.1 + i * .3), hor - H * .3, W * .1, H * .3);
      x.fillStyle = 'rgba(255,255,255,.09)';
      for (let i = 0; i < 4; i++) x.fillRect(W * (.12 + i * .24), H * .06, W * .08, H * .012);
    }
    x.restore();
  }
  drawActor(a, t, hor, night) {
    const { ctx: x, W, H } = this;
    const px = a.x * W, py = hor + (a.y - 0.52) * H * 1.6;
    const s = (H * 0.19) * a.scale;
    x.save();
    x.fillStyle = night ? '#E8E8E8' : '#C9D4E4';
    if (a.kind === 'vehicle') {
      const w = s * 2.6, h = s * .95;
      x.fillStyle = night ? '#DDD' : '#93A3BA';
      x.beginPath(); x.roundRect(px - w / 2, py - h, w, h, s * .18); x.fill();
      x.beginPath(); x.roundRect(px - w * .28, py - h * 1.55, w * .56, h * .62, s * .14); x.fill();
      x.fillStyle = '#0B0F14';
      x.beginPath(); x.arc(px - w * .3, py, s * .2, 0, 7); x.arc(px + w * .3, py, s * .2, 0, 7); x.fill();
      x.fillStyle = night ? 'rgba(255,240,200,.85)' : 'rgba(255,240,200,.55)';
      x.fillRect(px + a.dir * w * .48, py - h * .7, s * .18, s * .16);
    } else if (a.kind === 'animal') {
      const w = s * 1.1, h = s * .5;
      x.beginPath(); x.roundRect(px - w / 2, py - h, w, h, h * .4); x.fill();
      x.beginPath(); x.arc(px + a.dir * w * .5, py - h * 1.15, h * .38, 0, 7); x.fill();
      const sw = Math.sin(t / 120 + a.ph) * h * .3;
      x.fillRect(px - w * .3, py - h * .1, h * .16, h * .5 + sw);
      x.fillRect(px + w * .2, py - h * .1, h * .16, h * .5 - sw);
    } else {
      const sw = Math.sin(t / 190 + a.ph);
      x.beginPath(); x.arc(px, py - s * .86, s * .16, 0, 7); x.fill();               // bosh
      x.beginPath(); x.roundRect(px - s * .13, py - s * .70, s * .26, s * .42, s * .08); x.fill(); // tana
      x.strokeStyle = x.fillStyle; x.lineWidth = s * .085; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py - s * .3); x.lineTo(px + sw * s * .18, py); x.stroke();
      x.beginPath(); x.moveTo(px, py - s * .3); x.lineTo(px - sw * s * .18, py); x.stroke();
      x.beginPath(); x.moveTo(px - s * .1, py - s * .62); x.lineTo(px - s * .2 - sw * s * .1, py - s * .34); x.stroke();
      x.beginPath(); x.moveTo(px + s * .1, py - s * .62); x.lineTo(px + s * .2 + sw * s * .1, py - s * .34); x.stroke();
    }
    x.restore();

    // AI ramkasi
    const aiOn = this.cam.ai?.[a.kind === 'vehicle' ? 'vehicle' : a.kind === 'animal' ? 'animal' : 'person'];
    if (aiOn && this.o.hud) {
      const w = (a.kind === 'vehicle' ? s * 3 : s * .7), h = (a.kind === 'vehicle' ? s * 1.8 : s * 1.1);
      const bx = px - w / 2, by = py - h;
      x.strokeStyle = a.kind === 'person' ? '#A855F7' : a.kind === 'vehicle' ? '#2E8FFF' : '#F59E0B';
      x.lineWidth = Math.max(1.2, W / 420); x.strokeRect(bx, by, w, h);
      const lbl = a.kind === 'person' ? 'Odam' : a.kind === 'vehicle' ? 'Avto' : 'Hayvon';
      const fs = Math.max(8, W / 46);
      x.font = `600 ${fs}px Inter, sans-serif`;
      const tw = x.measureText(lbl).width + fs * .7;
      x.fillStyle = x.strokeStyle; x.fillRect(bx, by - fs * 1.35, tw, fs * 1.35);
      x.fillStyle = '#fff'; x.fillText(lbl, bx + fs * .35, by - fs * .35);
    }
  }
  drawHud(t, night) {
    const { ctx: x, W, H } = this;
    const fs = Math.max(8.5, W / 42);
    x.font = `500 ${fs}px ui-monospace, Menlo, monospace`;
    x.fillStyle = 'rgba(0,0,0,.45)';
    const d = new Date(), ds = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const tw = x.measureText(ds).width;
    const ty = H - fs * 1.7;
    x.fillRect(W - tw - fs * .8, ty, tw + fs * .6, fs * 1.5);
    x.fillStyle = 'rgba(255,255,255,.92)';
    x.fillText(ds, W - tw - fs * .5, ty + fs * 1.15);
    if (this.cam.recording && Math.floor(t / 600) % 2 === 0) {
      x.fillStyle = '#FF3B30'; x.beginPath(); x.arc(fs * .95, fs * 1.0, fs * .32, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.9)'; x.fillText('REC', fs * 1.5, fs * 1.3);
    }
    if (night) {
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.fillText('IR', fs * .7, H - fs * .6);
    }
  }
  fireEvent(a) {
    const now = Date.now();
    if (now - this.lastEvent < 20000) return;
    this.lastEvent = now;
    const type = a.kind === 'vehicle' ? 'vehicle' : a.kind === 'animal' ? 'animal' : 'person';
    if (!this.cam.ai?.[type] && !this.cam.motion?.enabled) return;
    const use = this.cam.ai?.[type] ? type : 'motion';
    const ev = addEvent(this.cam.id, use, { snap: this.snapDataUrl() });
    this.o.onEvent?.(ev);
    const names = { person: 'Odam', vehicle: 'Avtomobil', animal: 'Hayvon', motion: 'Harakat' };
    if (S.settings.push) notify(names[use] + ' aniqlandi', getCam(this.cam.id)?.name || '', 'ai', this.cam.id);
  }
  snapDataUrl() {
    try {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 135;
      c.getContext('2d').drawImage(this.cvs, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.5);
    } catch { return null; }
  }
  drawOffline() {
    const { ctx: x, W, H } = this;
    x.fillStyle = '#05080D'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.font = `600 ${Math.max(10, W / 26)}px Inter, sans-serif`;
    x.textAlign = 'center'; x.fillText('Signal yoʻq', W / 2, H / 2 + 4); x.textAlign = 'left';
  }
  setMuted(m) { this.muted = m; }
  get videoEl() { return null; }
  async snapshot() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    c.getContext('2d').drawImage(this.cvs, 0, 0);
    return c;
  }
  captureStream() { return this.cvs.captureStream ? this.cvs.captureStream(20) : null; }
  stop() { this.dead = true; renderers.delete(this); try { this._ro.disconnect(); } catch {} }
}

/* =========================================================================
 * Yozib olish (MediaRecorder) va snapshot yuklab olish
 * ========================================================================= */
export function downloadCanvas(canvas, name) {
  const file = name || `snapshot_${Date.now()}.jpg`;
  // Android ilovasida blob: yuklab olish ishlamaydi — native koʻprik orqali saqlanadi
  if (typeof window.BRILIANT?.saveBase64 === 'function') {
    try { window.BRILIANT.saveBase64(canvas.toDataURL('image/jpeg', 0.92), file, 'image/jpeg'); return; } catch {}
  }
  canvas.toBlob(b => saveBlob(b, file), 'image/jpeg', 0.92);
}

function saveBlob(blob, file, mime = 'application/octet-stream') {
  if (typeof window.BRILIANT?.saveBase64 === 'function' && blob.size < 24 * 1024 * 1024) {
    const fr = new FileReader();
    fr.onload = () => { try { window.BRILIANT.saveBase64(fr.result, file, mime); } catch { linkDownload(blob, file); } };
    fr.onerror = () => linkDownload(blob, file);
    fr.readAsDataURL(blob);
    return;
  }
  linkDownload(blob, file);
}

function linkDownload(blob, file) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}

export class Recorder {
  constructor(player, cam) { this.player = player; this.cam = cam; this.chunks = []; }
  get supported() { return typeof MediaRecorder !== 'undefined'; }
  start() {
    if (!this.supported) throw new Error('Bu brauzer yozib olishni qoʻllamaydi');
    const stream = this.player.captureStream();
    if (!stream) throw new Error('Oqimni olishning imkoni yoʻq');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2.5e6 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.startedAt = Date.now();
  }
  stop() {
    return new Promise(res => {
      if (!this.rec || this.rec.state === 'inactive') return res(null);
      this.rec.onstop = () => {
        const type = this.rec.mimeType || 'video/webm';
        const blob = new Blob(this.chunks, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const file = `${(this.cam.name || 'camera').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
        saveBlob(blob, file, type.split(';')[0]);
        res({ blob, ms: Date.now() - this.startedAt });
      };
      this.rec.stop();
    });
  }
}

/* --------- Ikki tomonlama audio (mikrofon orqali gapirish) --------- */
export class Talkback {
  constructor(cam) { this.cam = cam; }
  async start(onLevel) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    this.ac = ac;
    const srcNode = ac.createMediaStreamSource(this.stream);
    const an = ac.createAnalyser(); an.fftSize = 512;
    srcNode.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const tick = () => {
      if (!this.ac) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
      onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
      this._raf = requestAnimationFrame(tick);
    };
    tick();
    // Backend WHIP (ONVIF backchannel) mavjud boʻlsa — oqim serverga uzatiladi
    if (!S.settings.demo && S.settings.apiBase) {
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        this.pc = pc;
        this.stream.getAudioTracks().forEach(t => pc.addTrack(t, this.stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(`${S.settings.apiBase.replace(/\/+$/, '')}/cameras/${this.cam.id}/talk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp', ...(S.tokens?.access ? { Authorization: 'Bearer ' + S.tokens.access } : {}) },
          body: pc.localDescription.sdp,
        });
        if (res.ok) await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      } catch (e) { console.warn('talkback:', e.message); }
    }
  }
  stop() {
    cancelAnimationFrame(this._raf);
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch {}
    try { this.ac?.close(); } catch {} this.ac = null;
    try { this.pc?.close(); } catch {} this.pc = null;
  }
}
