/* BRILIANT — backend adapteri (REST + WebSocket).
 * apiBase boʻsh boʻlsa ilova demo rejimda ishlaydi: barcha maʼlumot qurilmada.
 * Endpointlar shartnomasi: docs/API.md
 */
import { S, save, notify, addEvent, updateCamera } from './store.js';

class Api {
  get base() { return (S.settings.apiBase || '').replace(/\/+$/, ''); }
  get enabled() { return !!this.base && !S.settings.demo; }

  async req(path, { method = 'GET', body, timeout = 15000, retry = true, headers = {} } = {}) {
    if (!this.enabled) throw new Error('API oʻchirilgan (demo rejim)');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(S.tokens?.access ? { Authorization: 'Bearer ' + S.tokens.access } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      if (res.status === 401 && retry && S.tokens?.refresh) {
        const ok = await this.refresh();
        if (ok) return this.req(path, { method, body, timeout, retry: false, headers });
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
        throw new Error(msg);
      }
      return res.status === 204 ? null : res.json();
    } finally { clearTimeout(t); }
  }

  get(p, o) { return this.req(p, { ...o }); }
  post(p, body, o) { return this.req(p, { method: 'POST', body, ...o }); }
  patch(p, body, o) { return this.req(p, { method: 'PATCH', body, ...o }); }
  del(p, o) { return this.req(p, { method: 'DELETE', ...o }); }

  /* --- Auth --- */
  async login(email, password) {
    const r = await this.post('/auth/login', { email, password });
    S.tokens = { access: r.accessToken, refresh: r.refreshToken };
    S.user = r.user; save('tokens', 'user');
    return r.user;
  }
  async register(name, email, password) {
    const r = await this.post('/auth/register', { name, email, password });
    S.tokens = { access: r.accessToken, refresh: r.refreshToken };
    S.user = r.user; save('tokens', 'user');
    return r.user;
  }
  async refresh() {
    try {
      const res = await fetch(this.base + '/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: S.tokens.refresh }),
      });
      if (!res.ok) throw new Error('refresh rad etildi');
      const r = await res.json();
      S.tokens = { access: r.accessToken, refresh: r.refreshToken || S.tokens.refresh };
      save('tokens');
      return true;
    } catch { S.tokens = null; save('tokens'); return false; }
  }
  logout() { if (this.enabled) this.post('/auth/logout', {}).catch(() => {}); }

  /* --- Kameralar --- */
  listCameras()        { return this.get('/cameras'); }
  createCamera(c)      { return this.post('/cameras', c); }
  editCamera(id, p)    { return this.patch('/cameras/' + id, p); }
  deleteCamera(id)     { return this.del('/cameras/' + id); }
  probe(c)             { return this.post('/cameras/probe', c, { timeout: 20000 }); }
  streamUrls(id)       { return this.get(`/cameras/${id}/stream`); }
  snapshot(id)         { return this.get(`/cameras/${id}/snapshot`); }
  ptz(id, cmd, speed)  { return this.post(`/cameras/${id}/ptz`, { command: cmd, speed }); }
  setIr(id, mode)      { return this.post(`/cameras/${id}/ir`, { mode }); }
  record(id, on)       { return this.post(`/cameras/${id}/record`, { enabled: on }); }
  timeline(id, day)    { return this.get(`/cameras/${id}/recordings?date=${day}`); }
  events(q = '')       { return this.get('/events' + (q ? '?' + q : '')); }

  /* --- Bulut integratsiyalari --- */
  cloudLink(provider, creds) { return this.post(`/integrations/${provider}/link`, creds, { timeout: 30000 }); }
  cloudDevices(provider)     { return this.get(`/integrations/${provider}/devices`); }

  /* --- WebSocket: jonli holat, AI hodisalari, bildirishnomalar --- */
  connectWs() {
    if (!this.enabled || this.ws) return;
    const url = this.base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(S.tokens?.access || '');
    try { this.ws = new WebSocket(url); } catch { return; }
    this.ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      this.handle(m);
    };
    this.ws.onclose = () => {
      this.ws = null;
      clearTimeout(this._rt);
      this._rt = setTimeout(() => this.connectWs(), 5000);
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch {} };
  }
  disconnectWs() { clearTimeout(this._rt); try { this.ws?.close(); } catch {} this.ws = null; }

  handle(m) {
    switch (m.type) {
      case 'camera.status':
        updateCamera(m.cameraId, { online: m.online, lastSeen: Date.now() });
        if (!m.online) notify('Kamera oflayn', m.name || '', 'offline', m.cameraId);
        break;
      case 'ai.event': {
        addEvent(m.cameraId, m.eventType, { confidence: m.confidence, clip: m.clipUrl, thumb: m.thumbUrl, ts: m.ts || Date.now() });
        const cam = S.cameras.find(c => c.id === m.cameraId);
        notify(labelOf(m.eventType) + ' aniqlandi', cam?.name || '', 'ai', m.cameraId);
        break;
      }
      case 'notification':
        notify(m.title, m.body, m.kind || 'info', m.cameraId);
        break;
    }
  }
}

const LBL = { person: 'Odam', vehicle: 'Avtomobil', animal: 'Hayvon', face: 'Yuz', motion: 'Harakat', line: 'Chegara buzilishi', intrusion: 'Hududga kirish', fire: "Yong'in" };
const labelOf = t => LBL[t] || 'Hodisa';

export const api = new Api();
