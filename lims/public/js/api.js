/** Server bilan aloqa. Token localStorage'da, ish stansiyasi nomi har so'rovda yuboriladi. */

const TOKEN_KEY = 'labcore.token';
const PC_KEY = 'labcore.pc';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
  /**
   * Ish stansiyasi nomi. Windows dasturida ishlayotgan bo'lsak — kompyuterning
   * haqiqiy nomi (o'zgartirib bo'lmaydi), aks holda qo'lda kiritilgan nom.
   */
  get computerName() { return window.labcore?.station || localStorage.getItem(PC_KEY) || ''; },
  set computerName(v) { if (!window.labcore?.station) localStorage.setItem(PC_KEY, v); },
  get isDesktop() { return !!window.labcore?.isDesktop; },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body, opts = {}) {
  const headers = { 'x-computer-name': auth.computerName || guessStation() };
  if (auth.token) headers.authorization = `Bearer ${auth.token}`;
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';

  const res = await fetch('/api' + url, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !opts.noRedirect) {
    auth.token = null;
    location.hash = '#/login';
    throw new ApiError(401, 'Sessiya tugadi — qayta kiring');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data?.error || `Xatolik (${res.status})`);
  return data;
}

export const api = {
  get: (u, opts) => request('GET', u, undefined, opts),
  // Kirish oynasidagi so'rovlar { noRedirect: true } bilan yuboriladi:
  // xato parol/PIN javobi (401) sahifani qayta yuklab, xatoni yashirib
  // yubormasligi kerak.
  post: (u, b, opts) => request('POST', u, b, opts),
  patch: (u, b, opts) => request('PATCH', u, b, opts),
  del: (u, opts) => request('DELETE', u, undefined, opts),
  upload: (u, formData, opts) => request('POST', u, formData, opts),
};

/** Kompyuter nomi qo'lda kiritilmagan bo'lsa taxminiy nom (sozlamalarda o'zgartiriladi). */
function guessStation() {
  const ua = navigator.userAgent;
  const os = /Windows NT 10/.test(ua) ? 'Windows-10' :
             /Windows/.test(ua) ? 'Windows' :
             /Mac/.test(ua) ? 'Mac' :
             /Android/.test(ua) ? 'Android' :
             /Linux/.test(ua) ? 'Linux' : 'PC';
  return `${os}-${(screen.width)}x${screen.height}`;
}
