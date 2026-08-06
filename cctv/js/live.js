/* BRILIANT — jonli koʻrish, multi-ekran, PTZ, arxiv, hodisalar, bildirishnomalar, xarita */
import { S, save, log, lsGet, lsSet, getCam, can, timeAgo, clock, dateStr, pad, EVENT_TYPES } from './store.js';
import { api } from './api.js';
import { createPlayer, Recorder, Talkback, downloadCanvas } from './player.js';
import { h, ico, toast, sheet, closeSheet, route, go, onLeave, topbar, empty, field, input, select, navRow, $ } from './ui.js';
import { eventCard, killPlayers } from './screens.js';

/* =====================  JONLI KOʻRISH  ===================== */
const players = new Map(); // tileIndex -> player

function stopAll() { players.forEach(p => { try { p.stop(); } catch {} }); players.clear(); }

/** Jonli koʻrish davomida ekran oʻchmasin (Android ilovasida native, brauzerda Wake Lock API) */
let wakeLock = null;
async function keepAwake(on) {
  try { window.BRILIANT?.keepAwake?.(on); } catch {}
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}

route('/live', () => liveView(null));
route('/live/:id', id => liveView(id));

function liveView(camId) {
  killPlayers(); stopAll();
  keepAwake(true);
  onLeave(() => { stopAll(); keepAwake(false); });
  const single = !!camId;
  let grid = single ? 1 : (S.settings.lastGrid || 4);
  let sel = 0;
  let muted = true, talking = null, recorder = null;

  const cams = S.cameras;
  if (!cams.length) {
    return h('div', { class: 'screen' }, topbar('Jonli koʻrish', { left: null }),
      empty('cam', 'Kamera yoʻq', 'Avval kamera qoʻshing',
        h('button', { class: 'btn', style: { marginTop: '14px' }, onclick: () => go('/add') }, 'Kamera qoʻshish')));
  }

  // Ekrandagi kameralar roʻyxati
  let slots = single ? [camId] : readSlots(grid, cams);

  const stage = h('div', { class: 'grid-stage g' + grid });
  const ctlbar = h('div', { class: 'ctlbar' });
  const ptzBox = h('div', {});
  const wrap = h('div', { class: 'screen full' });

  const activeCam = () => getCam(slots[sel]) || getCam(slots.find(Boolean)) || cams[0];

  function readSlots(g, list) {
    const saved = JSON.parse(lsGet('briliant:slots' + g) || 'null');
    const arr = Array.from({ length: g }, (_, i) => (saved?.[i] && getCam(saved[i]) ? saved[i] : list[i]?.id || null));
    return arr;
  }
  function persistSlots() { if (!single) lsSet('briliant:slots' + grid, JSON.stringify(slots)); }

  function renderStage() {
    stopAll();
    stage.className = 'grid-stage g' + grid;
    stage.innerHTML = '';
    slots.forEach((id, i) => {
      const cam = getCam(id);
      const tile = h('div', { class: 'tile' + (i === sel && !single ? ' sel' : '') , onclick: () => { sel = i; renderStage(); renderCtl(); } });
      stage.append(tile);
      if (!cam) {
        tile.append(h('div', { class: 'offline-veil', style: { cursor: 'pointer' } },
          h('div', { html: ico('plus', 22) }), h('div', {}, 'Kamera tanlang')));
        tile.onclick = () => pickCamera(i);
        return;
      }
      const box = h('div', { style: { width: '100%', height: '100%' } });
      tile.append(box, h('div', { class: 'lbl' }, cam.name));
      if (cam.online) tile.append(h('div', { class: 'badge tr live' }, h('i', { class: 'pulse' }), 'LIVE'));
      const p = createPlayer(box, cam, {
        fps: grid === 1 ? 22 : grid <= 4 ? 15 : 10,
        quality: grid === 1 ? 'main' : 'sub',
        muted: muted || i !== sel,
        hud: true,
      });
      players.set(i, p);
      if (!single) tile.addEventListener('dblclick', () => go('/live/' + cam.id));
    });
    persistSlots();
  }

  function pickCamera(i) {
    const list = h('div', {}, ...cams.map(c => navRow(c.name, `${c.online ? 'onlayn' : 'oflayn'} · ${c.host || c.brand}`, 'cam',
      () => { slots[i] = c.id; closeSheet(); renderStage(); renderCtl(); })),
      h('button', { class: 'btn sec', style: { marginTop: '8px' }, onclick: () => { slots[i] = null; closeSheet(); renderStage(); } }, "Boʻsh qoldirish"));
    sheet('Kamerani tanlang', list);
  }

  /* --- Boshqaruv tugmalari --- */
  function ctl(icon, label, on, onclick, cls = '') {
    return h('button', { class: 'ctl ' + cls + (on ? ' on' : ''), onclick, html: ico(icon, 20) + `<span>${label}</span>` });
  }

  function renderCtl() {
    const cam = activeCam();
    ctlbar.innerHTML = '';
    [
      ctl(muted ? 'mute' : 'spk', muted ? 'Ovoz' : 'Ovoz', !muted, () => {
        muted = !muted;
        players.forEach((p, i) => p.setMuted(muted || (!single && i !== sel)));
        renderCtl();
        toast(muted ? "Ovoz oʻchirildi" : 'Ovoz yoqildi');
      }),
      cam?.audioOut ? ctl('mic', 'Gapirish', !!talking, toggleTalk) : null,
      ctl('snap', 'Snapshot', false, doSnapshot),
      ctl('rec', recorder ? 'Toʻxtatish' : 'Yozish', !!recorder, toggleRecord, 'rec'),
      cam?.irSupported ? ctl('ir', 'Tungi', cam.ir === 'on', () => {
        const next = cam.ir === 'on' ? 'off' : 'on';
        cam.ir = next; save('cameras');
        if (api.enabled) api.setIr(cam.id, next).catch(() => {});
        toast('Tungi rejim: ' + (next === 'on' ? 'yoqildi' : "oʻchirildi"));
        renderCtl();
      }) : null,
      ctl('clock', 'Arxiv', false, () => go('/playback/' + cam.id)),
      ctl('ai', 'Hodisa', false, () => go('/events?cam=' + cam.id)),
      ctl('full', 'Toʻliq', false, toggleFull),
      ctl('set', 'Sozlash', false, () => go('/camera/' + cam.id)),
    ].filter(Boolean).forEach(b => ctlbar.append(b));
    // PTZ
    ptzBox.innerHTML = '';
    if (cam?.ptz && can('ptz')) ptzBox.append(ptzPad(cam));
  }

  async function doSnapshot() {
    const p = players.get(sel) || players.values().next().value;
    if (!p) return;
    const cvs = await p.snapshot();
    downloadCanvas(cvs, `${(activeCam().name || 'cam').replace(/\s+/g, '_')}_${Date.now()}.jpg`);
    log('camera.snapshot', { id: activeCam().id });
    toast('Snapshot saqlandi', 'ok');
  }

  async function toggleRecord() {
    const p = players.get(sel) || players.values().next().value;
    if (!p) return;
    if (recorder) {
      const r = await recorder.stop(); recorder = null;
      toast(r ? `Yozuv saqlandi (${Math.round(r.ms / 1000)} s)` : 'Yozuv toʻxtatildi', 'ok');
      log('camera.record.stop', { id: activeCam().id });
    } else {
      try {
        recorder = new Recorder(p, activeCam());
        recorder.start();
        toast('Yozib olish boshlandi', 'ok');
        log('camera.record.start', { id: activeCam().id });
      } catch (e) { recorder = null; toast(e.message, 'err'); }
    }
    renderCtl();
  }

  async function toggleTalk() {
    if (talking) { talking.stop(); talking = null; renderCtl(); toast('Mikrofon oʻchirildi'); return; }
    const t = new Talkback(activeCam());
    const bar = h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--brand)', width: '2%', transition: '.1s' } });
    try {
      await t.start(lvl => { bar.style.width = Math.max(2, lvl * 100) + '%'; });
      talking = t;
      sheet('Gapirish', h('div', {},
        h('p', { class: 'muted', style: { fontSize: '13px' } }, `${activeCam().name} — dinamikiga ovoz uzatilmoqda`),
        h('div', { style: { background: 'var(--surface2)', borderRadius: '3px', overflow: 'hidden', margin: '14px 0' } }, bar),
        h('button', { class: 'btn dan', onclick: () => { t.stop(); talking = null; closeSheet(); renderCtl(); } }, "Toʻxtatish")),
        { onClose: () => { t.stop(); talking = null; renderCtl(); } });
    } catch (e) { toast('Mikrofonga ruxsat berilmadi', 'err'); }
    renderCtl();
  }

  function toggleFull() {
    const el = stage.parentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => toast('Toʻliq ekran mavjud emas', 'err'));
  }

  /* --- Sarlavha --- */
  const gridBtns = h('div', { class: 'tabs', style: { margin: '10px 0' } },
    ...[1, 4, 9, 16].map(g => h('button', {
      class: grid === g ? 'on' : '', onclick: () => {
        grid = g; S.settings.lastGrid = g; save('settings');
        slots = readSlots(g, cams);
        [...gridBtns.children].forEach(b => b.classList.remove('on'));
        gridBtns.children[[1, 4, 9, 16].indexOf(g)].classList.add('on');
        sel = 0; renderStage(); renderCtl();
      }
    }, g + ' ekran')));

  const cam0 = single ? getCam(camId) : null;
  wrap.append(
    topbar(single ? (cam0?.name || 'Jonli') : 'Jonli koʻrish', {
      sub: single ? `${cam0?.online ? 'Onlayn' : 'Oflayn'} · ${cam0?.resolution || ''}` : `${cams.filter(c => c.online).length}/${cams.length} onlayn`,
      left: single ? undefined : null,
      right: single ? [h('button', { class: 'iconbtn', html: ico('grid', 20), onclick: () => go('/live') })]
                    : [h('button', { class: 'iconbtn', html: ico('refresh', 20), onclick: () => { renderStage(); toast('Yangilandi'); } })],
    }),
    h('div', { class: 'live-wrap' }, stage),
    h('div', { style: { padding: '0 16px calc(var(--nav-h) + var(--safe-b) + 20px)' } },
      single ? null : gridBtns,
      ctlbar,
      ptzBox,
      single ? h('div', { class: 'card', style: { marginTop: '6px' } },
        h('div', { class: 'row between' }, h('span', { class: 'muted', style: { fontSize: '12.5px' } }, 'Oqim sifati'),
          select([['sub', 'Tejamkor (SD)'], ['main', 'Yuqori (HD/4K)']], {
            value: grid === 1 ? 'main' : 'sub', style: 'width:auto;padding:6px 28px 6px 10px;font-size:12.5px',
            onchange: e => { renderStageQuality(e.target.value); },
          }))) : null));

  function renderStageQuality(q) {
    stopAll();
    slots.forEach((id, i) => {
      const cam = getCam(id); if (!cam) return;
      const tile = stage.children[i];
      const box = tile.querySelector('div');
      box.innerHTML = '';
      players.set(i, createPlayer(box, cam, { fps: q === 'main' ? 22 : 12, quality: q, muted: muted || i !== sel, hud: true }));
    });
    toast('Sifat: ' + (q === 'main' ? 'yuqori' : 'tejamkor'));
  }

  renderStage(); renderCtl();
  return wrap;
}

/* --- PTZ paneli --- */
function ptzPad(cam) {
  const send = cmd => {
    if (api.enabled) api.ptz(cam.id, cmd, 0.6).catch(e => toast(e.message, 'err'));
    else toast('PTZ: ' + cmd);
    log('camera.ptz', { id: cam.id, cmd });
  };
  const b = (icon, cmd, rot = 0) => h('button', {
    onpointerdown: () => send(cmd), onpointerup: () => api.enabled && api.ptz(cam.id, 'stop', 0).catch(() => {}),
    html: `<span style="display:block;transform:rotate(${rot}deg)">${ico('chev', 20)}</span>`,
  });
  const pad = h('div', { class: 'ptz' },
    b('chev', 'up-left', -135), b('chev', 'up', -90), b('chev', 'up-right', -45),
    b('chev', 'left', 180), h('button', { class: 'mid', onclick: () => send('home') }, 'HOME'), b('chev', 'right', 0),
    b('chev', 'down-left', 135), b('chev', 'down', 90), b('chev', 'down-right', 45));
  const zoom = h('div', { class: 'zoombar' },
    h('button', { class: 'btn sm sec', onclick: () => send('zoom-out') }, '−  Zoom'),
    h('button', { class: 'btn sm sec', onclick: () => send('zoom-in') }, '+  Zoom'),
    h('button', { class: 'btn sm sec', onclick: () => presets(cam) }, 'Presetlar'));
  return h('div', {}, h('div', { class: 'sec' }, h('h3', {}, 'PTZ boshqaruvi')), pad, zoom);
}
function presets(cam) {
  const list = cam.presets || (cam.presets = [{ id: 1, name: 'Darvoza' }, { id: 2, name: 'Yoʻlak' }, { id: 3, name: 'Avtoturargoh' }]);
  const box = h('div', {}, ...list.map(p => navRow(p.name, 'Preset #' + p.id, 'ptz', () => {
    if (api.enabled) api.ptz(cam.id, 'preset:' + p.id, 0).catch(() => {});
    toast(p.name + ' presetiga oʻtildi'); closeSheet();
  })),
    h('button', {
      class: 'btn sec', style: { marginTop: '8px' }, onclick: () => {
        const n = prompt('Preset nomi');
        if (n) { list.push({ id: list.length + 1, name: n }); save('cameras'); closeSheet(); toast('Preset saqlandi', 'ok'); }
      }
    }, 'Joriy holatni preset sifatida saqlash'));
  sheet('PTZ presetlar', box);
}

/* =====================  ARXIV (PLAYBACK)  ===================== */
route('/playback/:id', id => {
  killPlayers(); stopAll(); onLeave(stopAll);
  const cam = getCam(id) || S.cameras[0];
  if (!cam) { go('/cameras', true); return; }

  const qTs = +(location.hash.split('?t=')[1] || 0);
  let day = new Date(qTs || Date.now()); day.setHours(0, 0, 0, 0);
  let cursor = qTs ? new Date(qTs) : new Date();
  let playing = true, speed = 1;

  const stage = h('div', { class: 'tile', style: { aspectRatio: '16/9' } });
  const box = h('div', { style: { width: '100%', height: '100%' } });
  stage.append(box, h('div', { class: 'badge tl' }, 'ARXIV'));
  const timeLbl = h('div', { class: 'mono', style: { fontSize: '13px', fontWeight: 600 } });
  const tl = h('div', { class: 'timeline' });

  const segs = demoSegments(cam, day);
  const evs = () => S.events.filter(e => e.cameraId === cam.id && sameDay(e.ts, day));

  function drawTimeline() {
    tl.innerHTML = '';
    segs.forEach(s => {
      const l = (s.from / 86400) * 100, w = ((s.to - s.from) / 86400) * 100;
      tl.append(h('div', { class: 'seg', style: { left: l + '%', width: w + '%' } }));
    });
    evs().forEach(e => {
      const d = new Date(e.ts); const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      tl.append(h('div', { class: 'ev ' + e.type, style: { left: (sec / 86400) * 100 + '%' }, title: e.type }));
    });
    const hours = h('div', { class: 'hours' });
    for (let i = 0; i < 8; i++) hours.append(h('span', {}, pad(i * 3) + ':00'));
    tl.append(hours);
    const cur = h('div', { class: 'cur' }); tl.append(cur);
    updateCursor(cur);
    tl._cur = cur;
  }
  function updateCursor(cur = tl._cur) {
    if (!cur) return;
    const sec = cursor.getHours() * 3600 + cursor.getMinutes() * 60 + cursor.getSeconds();
    cur.style.left = (sec / 86400) * 100 + '%';
    timeLbl.textContent = `${dateStr(day.getTime())}  ${pad(cursor.getHours())}:${pad(cursor.getMinutes())}:${pad(cursor.getSeconds())}`;
  }
  const seek = e => {
    const r = tl.getBoundingClientRect();
    const x = Math.min(Math.max((e.touches?.[0]?.clientX ?? e.clientX) - r.left, 0), r.width);
    const sec = (x / r.width) * 86400;
    cursor = new Date(day.getTime() + sec * 1000);
    updateCursor();
  };
  tl.addEventListener('pointerdown', e => { seek(e); tl.setPointerCapture(e.pointerId); });
  tl.addEventListener('pointermove', e => { if (tl.hasPointerCapture?.(e.pointerId)) seek(e); });

  const player = createPlayer(box, { ...cam, recording: false }, { fps: 18, hud: true, quality: 'main' });
  players.set(0, player);

  const iv = setInterval(() => {
    if (!playing) return;
    cursor = new Date(cursor.getTime() + 1000 * speed);
    if (cursor > new Date()) { cursor = new Date(); playing = false; renderCtl(); }
    updateCursor();
  }, 1000);
  onLeave(() => clearInterval(iv));

  const ctlRow = h('div', { class: 'ctlbar' });
  function renderCtl() {
    ctlRow.innerHTML = '';
    ctlRow.append(
      h('button', { class: 'ctl', onclick: () => { playing = !playing; renderCtl(); }, html: ico(playing ? 'pause' : 'play', 20) + `<span>${playing ? 'Pauza' : 'Ijro'}</span>` }),
      ...[1, 2, 4, 8].map(s => h('button', {
        class: 'ctl' + (speed === s ? ' on' : ''), onclick: () => { speed = s; renderCtl(); },
        html: `<b style="font-size:13px">${s}×</b><span>tezlik</span>`,
      })),
      h('button', {
        class: 'ctl', onclick: async () => {
          const c = await player.snapshot(); downloadCanvas(c, `arxiv_${cam.name}_${Date.now()}.jpg`); toast('Saqlandi', 'ok');
        }, html: ico('snap', 20) + '<span>Snapshot</span>'
      }),
      h('button', { class: 'ctl', onclick: () => exportClip(), html: ico('down', 20) + '<span>Yuklab olish</span>' }),
      h('button', { class: 'ctl', onclick: () => go('/live/' + cam.id), html: ico('play', 20) + '<span>Jonli</span>' }));
  }
  function exportClip() {
    if (api.enabled) {
      const from = Math.floor(cursor.getTime() / 1000) - 30, to = from + 90;
      window.open(`${S.settings.apiBase}/cameras/${cam.id}/export?from=${from}&to=${to}`, '_blank');
    } else toast('Demo rejimda eksport mavjud emas');
  }

  const dayInput = input({
    type: 'date', value: new Date(day.getTime() - day.getTimezoneOffset() * 6e4).toISOString().slice(0, 10),
    onchange: e => {
      const d = new Date(e.target.value); if (isNaN(d)) return;
      day = d; day.setHours(0, 0, 0, 0);
      cursor = new Date(day.getTime() + 12 * 36e5);
      drawTimeline(); updateCursor();
    },
  });

  drawTimeline(); renderCtl(); updateCursor();

  const evList = h('div', {});
  const renderEvs = () => { evList.innerHTML = ''; const list = evs(); if (!list.length) evList.append(h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Bu kuni hodisa yozilmagan')); else list.slice(0, 12).forEach(e => evList.append(eventCard(e))); };
  renderEvs();

  return h('div', { class: 'screen full' },
    topbar('Arxiv', { sub: cam.name, right: [h('button', { class: 'iconbtn', html: ico('cal', 20), onclick: () => dayInput.showPicker?.() })] }),
    h('div', { class: 'live-wrap' }, stage),
    h('div', { style: { padding: '12px 16px calc(var(--nav-h) + var(--safe-b) + 20px)' } },
      h('div', { class: 'row between', style: { marginBottom: '8px' } }, timeLbl, h('div', { style: { width: '150px' } }, dayInput)),
      tl,
      h('div', { class: 'row', style: { gap: '10px', marginTop: '8px', fontSize: '11px' } },
        lg('#2E8FFF', 'Yozuv'), lg('#A855F7', 'Odam'), lg('#2E8FFF', 'Avto'), lg('#F59E0B', 'Hayvon'), lg('#22C55E', 'Harakat')),
      ctlRow,
      h('div', { class: 'sec' }, h('h3', {}, 'Shu kundagi hodisalar')),
      evList));
});
const lg = (c, t) => h('span', { class: 'row', style: { gap: '4px' } }, h('i', { style: { width: '8px', height: '8px', borderRadius: '2px', background: c, display: 'block' } }), h('span', { class: 'muted' }, t));
const sameDay = (ts, d) => { const a = new Date(ts); return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate(); };
function demoSegments(cam, day) {
  if (!cam.recording) return [{ from: 6 * 3600, to: 9 * 3600 }, { from: 17 * 3600, to: 21 * 3600 }];
  const now = new Date();
  const end = sameDay(now.getTime(), day) ? now.getHours() * 3600 + now.getMinutes() * 60 : 86400;
  return [{ from: 0, to: end }];
}

/* =====================  AI HODISALAR  ===================== */
route('/events', () => {
  const qs = new URLSearchParams((location.hash.split('?')[1] || ''));
  let type = 'all', camF = qs.get('cam') || 'all', dayF = 'all';
  const list = h('div', {});

  function render() {
    list.innerHTML = '';
    let evs = S.events.slice();
    if (type !== 'all') evs = evs.filter(e => e.type === type);
    if (camF !== 'all') evs = evs.filter(e => e.cameraId === camF);
    if (dayF === 'today') evs = evs.filter(e => sameDay(e.ts, new Date()));
    else if (dayF === 'week') evs = evs.filter(e => Date.now() - e.ts < 7 * 864e5);
    if (!evs.length) { list.append(empty('ai', 'Hodisa yoʻq', 'Tanlangan filtr boʻyicha hodisa topilmadi')); return; }
    evs.slice(0, 120).forEach(e => list.append(eventCard(e)));
  }

  const typeChips = h('div', { class: 'chips' },
    ...[['all', 'Barchasi'], ...Object.entries(EVENT_TYPES).map(([k, v]) => [k, v.name])].map(([k, l]) =>
      h('button', {
        class: 'chip' + (type === k ? ' on ai' : ''), onclick: e => {
          type = k; [...typeChips.children].forEach(c => c.classList.remove('on', 'ai'));
          e.target.classList.add('on', 'ai'); render();
        }
      }, l)));

  const camSel = select([['all', 'Barcha kameralar'], ...S.cameras.map(c => [c.id, c.name])], {
    value: camF, onchange: e => { camF = e.target.value; render(); },
  });
  const daySel = select([['all', 'Barcha vaqt'], ['today', 'Bugun'], ['week', 'Bir hafta']], {
    value: 'all', onchange: e => { dayF = e.target.value; render(); },
  });

  render();
  return h('div', { class: 'screen', style: { paddingTop: '0' } },
    topbar('AI hodisalar', {
      left: null, sub: `${S.events.length} ta yozuv`,
      right: [h('button', {
        class: 'iconbtn', html: ico('check', 20), onclick: () => {
          S.events.forEach(e => e.seen = true); save('events'); render(); toast("Barchasi koʻrildi deb belgilandi", 'ok');
        }
      })],
    }),
    typeChips,
    h('div', { class: 'row', style: { gap: '10px', margin: '10px 0' } },
      h('div', { class: 'grow' }, camSel), h('div', { class: 'grow' }, daySel)),
    list);
});

/* =====================  BILDIRISHNOMALAR  ===================== */
route('/notifications', () => {
  const list = h('div', {});
  function render() {
    list.innerHTML = '';
    if (!S.notifs.length) { list.append(empty('bell', 'Bildirishnoma yoʻq', 'Yangi hodisalar shu yerda koʻrinadi')); return; }
    S.notifs.forEach(n => {
      const icons = { ai: 'ai', offline: 'cam', info: 'info', system: 'server' };
      list.append(h('div', {
        class: 'rowitem', style: n.read ? {} : { borderColor: 'var(--brand)' },
        onclick: () => { n.read = true; save('notifs'); if (n.cameraId) go('/live/' + n.cameraId); else render(); },
      },
        h('div', { class: 'ic', html: ico(icons[n.kind] || 'bell', 18) }),
        h('div', { class: 'grow' }, h('b', {}, n.title), h('small', {}, `${n.body || ''} · ${timeAgo(n.ts)}`)),
        n.read ? null : h('i', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand)', display: 'block' } })));
    });
  }
  render();
  return h('div', { class: 'screen', style: { paddingTop: '0' } },
    topbar('Bildirishnomalar', {
      left: null,
      right: [
        h('button', { class: 'iconbtn', html: ico('set', 20), onclick: () => go('/settings/notifications') }),
        h('button', {
          class: 'iconbtn', html: ico('check', 20), onclick: () => { S.notifs.forEach(n => n.read = true); save('notifs'); render(); }
        }),
      ],
    }), list);
});

/* =====================  XARITA  ===================== */
route('/map', () => {
  const mapEl = h('div', { id: 'map' });
  const wrap = h('div', { class: 'screen full' },
    topbar('Xarita', { left: null, sub: `${S.cameras.filter(c => c.lat).length} ta kamera joylashtirilgan` }),
    h('div', { style: { position: 'relative' } }, mapEl));

  const withCoords = S.cameras.filter(c => c.lat && c.lng);
  if (!withCoords.length) {
    mapEl.replaceWith(empty('map', 'Koordinatalar yoʻq', 'Kamera sozlamalarida joylashuvni belgilang'));
    return wrap;
  }

  loadYmaps().then(() => {
    // eslint-disable-next-line no-undef
    ymaps.ready(() => {
      const first = withCoords[0];
      // eslint-disable-next-line no-undef
      const map = new ymaps.Map(mapEl, { center: [first.lat, first.lng], zoom: 15, controls: ['zoomControl'] }, { suppressMapOpenBlock: true });
      withCoords.forEach(c => {
        // eslint-disable-next-line no-undef
        const pm = new ymaps.Placemark([c.lat, c.lng], {
          balloonContentHeader: c.name,
          balloonContentBody: `${c.online ? 'Onlayn' : 'Oflayn'} · ${c.resolution}`,
          hintContent: c.name,
        }, { preset: c.online ? 'islands#blueVideoIcon' : 'islands#grayVideoIcon' });
        pm.events.add('click', () => go('/live/' + c.id));
        map.geoObjects.add(pm);
      });
    });
  }).catch(() => {
    mapEl.replaceWith(h('div', { class: 'screen' },
      empty('map', 'Xarita yuklanmadi', 'Internet aloqasini tekshiring'),
      ...withCoords.map(c => navRow(c.name, `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`, 'cam', () => go('/live/' + c.id)))));
  });
  return wrap;
});

let ymapsP;
function loadYmaps() {
  if (window.ymaps) return Promise.resolve();
  if (!ymapsP) ymapsP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://api-maps.yandex.ru/2.1/?apikey=6f9911e6-17d0-4de5-a252-8771f99dcc03&lang=ru_RU';
    s.onload = res; s.onerror = () => rej(new Error('ymaps'));
    document.head.appendChild(s);
  });
  return ymapsP;
}
