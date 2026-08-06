/* ITCode CCTV — UI yordamchilari: ikonkalar, router, sheet, toast */

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(k => k != null && e.append(k.nodeType ? k : document.createTextNode(k)));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Ikonkalar (24x24 stroke) ---------- */
const P = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20h5v-5h4v5h5V9.5',
  cam: 'M2 7.5A1.5 1.5 0 0 1 3.5 6h9A1.5 1.5 0 0 1 14 7.5v9A1.5 1.5 0 0 1 12.5 18h-9A1.5 1.5 0 0 1 2 16.5zM14 10.5l6-3.5v10l-6-3.5',
  cctv: 'M3 6.6 16.5 3l1.8 6.2L4.8 12.8zM6 12l1 4M4 20h8M9.5 16a2.5 2.5 0 0 1 5 0v4',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  back: 'M19 12H5M12 19l-7-7 7-7',
  chev: 'M9 18l6-6-6-6',
  chevd: 'M6 9l6 6 6-6',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3M19 11a7 7 0 0 1-14 0M12 18v4',
  spk: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  mute: 'M11 5 6 9H3v6h3l5 4zM17 9l4 6M21 9l-4 6',
  snap: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  rec: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  ptz: 'M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  ir: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2M17 3l1.5 3L22 7l-2.6 2.2.7 3.6L17 11l-3.1 1.8.7-3.6L12 7l3.5-1z',
  ai: 'M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6zM9 12l2 2 4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2',
  map: 'M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6zM9 3v15M15 6v15',
  set: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1',
  star: 'm12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  wifi: 'M2 8.8a16 16 0 0 1 20 0M5 12.3a11 11 0 0 1 14 0M8.5 15.8a6 6 0 0 1 7 0M12 20h.01',
  lan: 'M6 3h12v5H6zM12 8v4M4 16h5v5H4zM15 16h5v5h-5zM6.5 16v-4h11v4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7L11.8 5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.2 19',
  cloud: 'M18 18a4 4 0 0 0 0-8 6 6 0 0 0-11.7 1.7A3.5 3.5 0 0 0 6.5 18z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  shield: 'M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  full: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5',
  down: 'M12 3v13M6 11l6 6 6-6M4 21h16',
  server: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01',
  db: 'M12 7c5 0 9-1.1 9-2.5S17 2 12 2 3 3.1 3 4.5 7 7 12 7M3 4.5v15C3 21 7 22 12 22s9-1 9-2.5v-15M3 12c0 1.4 4 2.5 9 2.5s9-1.1 9-2.5',
  chart: 'M3 3v18h18M7 15l3-4 3 3 5-7',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  key: 'M15 7a4 4 0 1 1-3.9 5L8 15l-2 2-3-3 8-8a4 4 0 0 1 4-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8h.01M11 12h1v5h1',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  cal: 'M3 6h18v15H3zM3 10h18M8 3v4M16 3v4',
  tg: 'm21 4-3 16-6-4.5L21 4M12 15.5 9 21l-.5-5L21 4 5.5 12.5 2 11z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  wave: 'M3 12h3l2-6 3 14 3-11 2 5h5',
};
export function ico(name, size = 20, cls = '') {
  const d = P[name] || P.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/* ---------- Toast ---------- */
let toastT;
export function toast(msg, kind = '') {
  $('.toast')?.remove();
  const t = h('div', { class: 'toast ' + kind }, msg);
  document.body.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 2600);
}

/* ---------- Sheet (pastdan chiquvchi oyna) ---------- */
export function sheet(title, contentEl, { onClose } = {}) {
  closeSheet();
  const veil = h('div', { class: 'veil', onclick: () => closeSheet() });
  const s = h('div', { class: 'sheet' },
    h('div', { class: 'grip' }),
    title ? h('div', { class: 'row between', style: { marginBottom: '12px' } },
      h('h2', {}, title),
      h('button', { class: 'iconbtn plain', html: ico('x', 20), onclick: () => closeSheet() })) : null,
    contentEl);
  document.body.append(veil, s);
  document.body.style.overflow = 'hidden';
  closeSheet._cb = onClose;
  return s;
}
export function closeSheet() {
  $('.veil')?.remove(); $('.sheet')?.remove();
  document.body.style.overflow = '';
  const cb = closeSheet._cb; closeSheet._cb = null; cb?.();
}
export function confirmSheet(title, text, okLabel = 'Tasdiqlash') {
  return new Promise(res => {
    // Qaror avval yozib olinadi: closeSheet() onClose ni chaqiradi va javob shundan olinadi
    let decision = false;
    const body = h('div', {},
      h('p', { class: 'muted', style: { margin: '0 0 16px' } }, text),
      h('button', { class: 'btn dan', onclick: () => { decision = true; closeSheet(); } }, okLabel),
      h('button', { class: 'btn sec', style: { marginTop: '8px' }, onclick: () => closeSheet() }, 'Bekor qilish'));
    sheet(title, body, { onClose: () => res(decision) });
  });
}

/* ---------- Router ---------- */
const routes = new Map();
export const route = (path, fn) => routes.set(path, fn);
export function go(path, replace = false) {
  if (replace) location.replace('#' + path); else location.hash = path;
}
export const back = () => (history.length > 1 ? history.back() : go('/dashboard'));

export function currentPath() {
  return (location.hash || '#/dashboard').slice(1);
}
let leaveHook = null;
export const onLeave = fn => { leaveHook = fn; };

export function renderRoute(root) {
  const path = currentPath();
  try { leaveHook?.(); } catch (e) { console.error(e); }
  leaveHook = null;
  closeSheet();
  let match = routes.get(path), params = [];
  if (!match) {
    for (const [p, fn] of routes) {
      if (!p.includes(':')) continue;
      const rx = new RegExp('^' + p.replace(/:[^/]+/g, '([^/]+)') + '$');
      const m = path.match(rx);
      if (m) { match = fn; params = m.slice(1); break; }
    }
  }
  root.innerHTML = '';
  if (!match) { go('/dashboard', true); return; }
  const view = match(...params);
  if (view) root.appendChild(view);
  window.scrollTo(0, 0);
}

/* ---------- Umumiy bloklar ---------- */
export function topbar(title, { sub, left, right = [] } = {}) {
  return h('div', { class: 'topbar' },
    left === null ? null : (left || h('button', { class: 'iconbtn', html: ico('back', 20), onclick: back })),
    h('div', { class: 'grow' }, h('h1', {}, title), sub ? h('div', { class: 'sub' }, sub) : null),
    ...right);
}
export function empty(icon, title, text, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'big', html: ico(icon, 40) }),
    h('h3', {}, title),
    h('p', { class: 'muted', style: { fontSize: '13px' } }, text),
    action || null);
}
export function field(label, inputEl) {
  return h('div', { class: 'field' }, label ? h('label', {}, label) : null, inputEl);
}
export function input(attrs = {}) { return h('input', { class: 'inp', ...attrs }); }
export function select(options, attrs = {}) {
  const s = h('select', { class: 'inp', ...attrs });
  options.forEach(([v, l]) => s.append(h('option', { value: v, selected: attrs.value === v }, l)));
  if (attrs.value != null) s.value = attrs.value;
  return s;
}
export function toggleRow(label, sub, on, onChange, iconName) {
  const sw = h('div', { class: 'switch' + (on ? ' on' : '') });
  const row = h('div', {
    class: 'rowitem', onclick: () => {
      const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next); onChange(next);
    }
  },
    iconName ? h('div', { class: 'ic', html: ico(iconName, 18) }) : null,
    h('div', { class: 'grow' }, h('b', {}, label), sub ? h('small', {}, sub) : null),
    sw);
  return row;
}
export function navRow(label, sub, iconName, onclick, right) {
  return h('div', { class: 'rowitem', onclick },
    iconName ? h('div', { class: 'ic', html: ico(iconName, 18) }) : null,
    h('div', { class: 'grow' }, h('b', {}, label), sub ? h('small', {}, sub) : null),
    right ? h('span', { class: 'muted', style: { fontSize: '12px' } }, right) : null,
    h('span', { class: 'dim', html: ico('chev', 18) }));
}
