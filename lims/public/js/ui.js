/** Interfeys yordamchilari: DOM qurish, formatlash, modal, xabarnoma. */

/** el('div.card', {onclick}, [bolalar]) */
export function el(spec, props = {}, children = []) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className += ' ' + v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(node) { while (node.firstChild) node.firstChild.remove(); return node; }

// ---------------------------------------------------------------------------
// Formatlash
// ---------------------------------------------------------------------------

export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtTime(v) {
  return v ? new Date(v).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function fmtMoney(v, currency = "so'm") {
  const n = Number(v || 0);
  return `${n.toLocaleString('uz-UZ')} ${currency}`;
}

export function fmtSize(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function age(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

export const GENDER = { m: 'Erkak', f: 'Ayol', u: '—' };

// Brauzerning uz-UZ lokali oylarni "M08" ko'rinishida beradi — o'zimiz yozamiz.
export const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

/** "4-avgust, 2026" ko'rinishidagi to'liq sana. */
export function fmtDateLong(v) {
  const d = v ? new Date(v) : new Date();
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

export const ROLE_LABEL = {
  admin: 'Administrator', laborant: 'Laborant', doctor: 'Shifokor', cashier: 'Kassir',
};

export const STATUS_LABEL = {
  new: 'Yangi', in_progress: 'Jarayonda', ready: 'Tayyor',
  confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan',
};

export const FLAG_LABEL = {
  normal: 'Norma', low: 'Past', high: 'Yuqori',
  critical_low: 'Kritik past', critical_high: 'Kritik yuqori', abnormal: 'Chetda',
};

export const ACTION_LABEL = {
  LOGIN: 'Kirdi', LOGOUT: 'Chiqdi', LOGIN_FAILED: 'Kirish urinishi',
  VIEW: 'Ko‘rdi', SEARCH: 'Qidirdi', CREATE: 'Qo‘shdi', UPDATE: 'O‘zgartirdi',
  DELETE: 'O‘chirdi', CONFIRM: 'Tasdiqladi', PRINT: 'Chop etdi', PAYMENT: 'To‘lov',
  UPLOAD: 'Fayl yukladi', DOWNLOAD: 'Fayl oldi', ACCESS_DENIED: 'Ruxsatsiz urinish',
};

export function statusBadge(status) {
  const cls = { confirmed: 'ok', ready: 'info', in_progress: 'warn', cancelled: 'danger' }[status] || '';
  return el(`span.badge.${cls}`, { text: STATUS_LABEL[status] || status });
}

export function flagBadge(flag) {
  if (!flag) return el('span.muted', { text: '—' });
  const cls = { normal: 'ok', low: 'warn', high: 'warn', critical_low: 'danger', critical_high: 'danger' }[flag];
  return el(`span.badge.${cls}`, { text: FLAG_LABEL[flag] || flag });
}

export const fullName = (p) => [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ');

export const initials = (name) =>
  String(name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

/**
 * Xodim rasmi. Rasm yo'q bo'lsa (yoki yuklanmasa) ism harflari ko'rinadi —
 * ro'yxat hech qachon bo'sh kvadratlar bilan qolmaydi.
 *
 * @param {object} u    — { id, full_name, has_photo, photo_updated_at }
 * @param {object} opts — { size: px, src: to'liq manzil (kirish oynasi uchun) }
 */
export function avatar(u = {}, { size = 34, src } = {}) {
  const box = el('span.avatar', {
    style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`,
    title: u.full_name || '',
  }, [el('span', { text: initials(u.full_name) })]);

  const url = src || (u.has_photo
    ? `/api/users/${u.id}/photo?v=${encodeURIComponent(u.photo_updated_at || '1')}`
    : null);
  if (!url) return box;

  const img = el('img', { src: url, alt: u.full_name || '', loading: 'lazy' });
  img.onerror = () => img.remove();
  box.append(img);
  return box;
}

// ---------------------------------------------------------------------------
// Xabarnoma va modal
// ---------------------------------------------------------------------------

export function toast(message, kind = '') {
  const node = el(`div.toast.${kind}`, { text: message });
  $('#toasts').append(node);
  setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 300); }, 4000);
}

export const toastError = (err) => toast(err?.message || String(err), 'err');
export const toastOk = (msg) => toast(msg, 'ok');

/**
 * modal({ title, body, actions }) — actions: [{label, primary, onClick}]
 * onClick true qaytarsa (yoki Promise<true>) oyna yopiladi.
 */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const root = $('#modal-root');
  const close = () => { clear(root); onClose?.(); };

  const buttons = actions.map((a) =>
    el(`button${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}`, {
      text: a.label,
      onclick: async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          const keep = await a.onClick?.();
          if (keep !== false) close();
        } catch (err) {
          toastError(err);
        } finally {
          btn.disabled = false;
        }
      },
    }),
  );

  const box = el(`div.modal${wide ? '.wide' : ''}`, {}, [
    el('h3', { text: title }),
    body,
    el('div.row', { style: 'justify-content:flex-end;margin-top:16px' }, [
      el('button.ghost', { text: 'Yopish', onclick: close }),
      ...buttons,
    ]),
  ]);

  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) close(); } }, [box]);
  clear(root).append(bg);
  setTimeout(() => box.querySelector('input, select, textarea')?.focus(), 30);
  return { close, box };
}

export function confirmDialog(question, onYes, { danger = true, label = 'Tasdiqlash' } = {}) {
  modal({
    title: 'Tasdiqlaysizmi?',
    body: el('p', { text: question }),
    actions: [{ label, primary: !danger, danger, onClick: onYes }],
  });
}

/** Formadagi barcha nomlangan maydonlarni ob'ekt sifatida yig'adi. */
export function readForm(root) {
  const out = {};
  for (const input of root.querySelectorAll('[name]')) {
    out[input.name] = input.type === 'checkbox' ? input.checked : input.value.trim();
  }
  return out;
}

export function field(label, input) {
  return el('div.field', {}, [el('label', { text: label }), input]);
}

export function table(headers, rows) {
  return el('div.table-wrap', {}, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]),
  ]);
}

export function emptyRow(cols, text = 'Ma’lumot yo‘q') {
  return el('tr', {}, [el('td', { colspan: cols, class: 'empty', text })]);
}
