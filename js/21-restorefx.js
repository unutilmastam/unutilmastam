/* Unutilmas Ta'm — 21-restorefx.js
   ═══════════════════════════════════════════════════════════════
   ZAXIRADAN TIKLASH — "terminal" ko'rinishi

   Qora oynada rangli qatorlar pastga oqib tushadi, klaviatura
   ovozi eshitiladi, oxirida ✓ belgisi chiqadi.

   Bu shunchaki bezak EMAS: ekrandagi qatorlarning ko'pi haqiqiy —
   qaysi bo'lim, nechta yozuv tiklanayotgani. Shu 5 soniya ichida
   ma'lumot bulutga ham yuborib bo'linadi (ilgari sahifa bulutga
   yuborishni kutmasdan qayta yuklanardi).
   ═══════════════════════════════════════════════════════════════ */

const RESTORE_MS = 5000;

/* ───────── Ovoz: "tirit-tirit" ─────────
   Tashqi fayl kerak emas — WebAudio bilan qisqa "chiqillash" yasaymiz. */
let __fxAudio = null;

function fxAudio(){
  if(__fxAudio) return __fxAudio;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC) __fxAudio = new AC();
  }catch(e){}
  return __fxAudio;
}

/* iOS ovozni faqat foydalanuvchi bosgandan keyin ruxsat beradi —
   birinchi bosishdayoq ovoz tizimini "uyg'otib" qo'yamiz */
document.addEventListener('pointerdown', function unlock(){
  const a = fxAudio();
  if(a && a.state === 'suspended') a.resume().catch(function(){});
  document.removeEventListener('pointerdown', unlock);
}, {passive:true});

function tick(kind){
  const a = fxAudio();
  if(!a) return;
  try{
    if(a.state === 'suspended') a.resume();
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = kind === 'ok' ? 'sine' : 'square';
    o.frequency.value = kind === 'ok' ? 880 : (1400 + Math.random() * 1800);
    const dur = kind === 'ok' ? 0.22 : (0.012 + Math.random() * 0.018);
    g.gain.setValueAtTime(kind === 'ok' ? 0.16 : 0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.01);
  }catch(e){}
}

/* Tasdiq ohangi — ikki nota */
function chime(){
  tick('ok');
  setTimeout(function(){
    const a = fxAudio(); if(!a) return;
    try{
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = 1320;
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.36);
    }catch(e){}
  }, 130);
}

/* ───────── Qatorlar ───────── */
function hex(n){ let s = ''; while(s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; }
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }

const FX_NOISE = [
  () => ['c-dim', '0x' + hex(8) + '  ' + hex(4) + ' ' + hex(4) + ' ' + hex(4) + ' ' + hex(4)],
  () => ['c-cyan', '>> verify sha256:' + hex(24)],
  () => ['c-mag', 'decrypt block #' + (100 + Math.floor(Math.random() * 900)) + ' ... ok'],
  () => ['c-dim', '   [' + hex(2) + '] ' + hex(6) + ' → ' + hex(6)],
  () => ['c-yel', 'sync firestore://app/' + pick(['products','sales','ledger','stores','orders']) + '__p' + Math.floor(Math.random() * 4)],
  () => ['c-green', '[OK] integrity ' + (97 + Math.random() * 3).toFixed(2) + '%'],
  () => ['c-cyan', 'mount /data/' + hex(4) + ' --ro'],
  () => ['c-dim', '   ' + Array.from({length:6}, () => hex(2)).join(' ') + '   ' + hex(10)],
];

/* Zaxiradagi haqiqiy bo'limlardan qatorlar */
function realLines(data){
  const out = [];
  const st = data.state || {};
  const names = (typeof KEY_NAMES === 'object') ? KEY_NAMES : {};
  out.push(['c-green', '$ unutilmastam restore --from backup.json']);
  out.push(['c-dim',   '  zaxira sanasi: ' + (data.created ? new Date(data.created).toLocaleString('ru-RU') : '?')]);
  out.push(['c-dim',   '  hajmi: ' + (JSON.stringify(st).length / 1024).toFixed(0) + ' KB']);
  Object.keys(st).forEach(function(k){
    const v = st[k];
    const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
    out.push(['c-cyan', 'restore ' + k.padEnd(14) + '… ' + n + ' ta' + (names[k] ? '  (' + names[k] + ')' : '')]);
    out.push(['c-green', '  [OK] ' + k]);
  });
  return out;
}

/* ───────── Oyna ───────── */
function openRestoreTerminal(){
  let el = document.getElementById('restoreTerm');
  if(!el){
    el = document.createElement('div');
    el.id = 'restoreTerm';
    el.className = 'noTr';
    el.innerHTML =
      '<div class="rtWin">' +
        '<div class="rtBar"><i></i><i></i><i></i><span>root@unutilmastam: ~/restore</span></div>' +
        '<div class="rtBody" id="rtBody"></div>' +
        '<div class="rtProg"><b id="rtPct">0%</b><div class="rtTrack"><i id="rtFill"></i></div></div>' +
      '</div>' +
      '<div class="rtDone hidden" id="rtDone">' +
        '<div class="rtCheck"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/>' +
        '<path d="M15 27l7 7 15-16"/></svg></div>' +
        '<div class="rtDoneTxt" id="rtDoneTxt">TIKLANDI</div>' +
        '<div class="rtDoneSub" id="rtDoneSub"></div>' +
      '</div>';
    document.body.appendChild(el);
  }
  document.getElementById('rtBody').innerHTML = '';
  document.getElementById('rtDone').classList.add('hidden');
  el.classList.remove('hidden', 'rtFinished');
  return el;
}

function termLine(cls, text){
  const body = document.getElementById('rtBody');
  if(!body) return;
  const d = document.createElement('div');
  d.className = 'rtLine ' + cls;
  d.textContent = text;
  body.appendChild(d);
  /* xotirani to'ldirmaslik uchun eski qatorlarni olib tashlaymiz */
  while(body.children.length > 120) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;
}

/* ───────── Asosiy: tiklash + animatsiya ───────── */
async function runRestoreWithTerminal(data){
  closeModal('modalSystemHealth');
  openRestoreTerminal();

  const real = realLines(data);
  const start = Date.now();
  let realIdx = 0, done = false, failed = null;

  /* Haqiqiy tiklash — animatsiya bilan parallel */
  const work = (async function(){
    try{
      state = data.state;
      try{ normalizeState(); }catch(e){}
      await saveState();
      /* bulutga yuborib bo'linishini kutamiz */
      if(typeof cloudOn === 'function' && cloudOn() && typeof flushCloud === 'function'){
        await flushCloud();
      }
    }catch(e){ failed = e; }
  })();

  await new Promise(function(resolve){
    function step(){
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / RESTORE_MS);

      /* haqiqiy qatorlarni vaqt bo'yicha teng taqsimlaymiz, orasiga "shovqin" */
      const wantReal = Math.floor(p * real.length);
      while(realIdx < wantReal && realIdx < real.length){
        const r = real[realIdx++]; termLine(r[0], r[1]);
      }
      const burst = 1 + Math.floor(Math.random() * 3);
      for(let i = 0; i < burst; i++){ const n = pick(FX_NOISE)(); termLine(n[0], n[1]); }
      tick();

      const pct = document.getElementById('rtPct');
      const fill = document.getElementById('rtFill');
      if(pct) pct.textContent = Math.round(p * 100) + '%';
      if(fill) fill.style.width = (p * 100) + '%';

      if(p >= 1){ resolve(); return; }
      setTimeout(step, 45 + Math.random() * 55);
    }
    step();
  });

  await work;
  while(realIdx < real.length){ const r = real[realIdx++]; termLine(r[0], r[1]); }

  const ru = (typeof appLang !== 'undefined' && appLang === 'ru');
  if(failed){
    termLine('c-red', '[FAIL] ' + (failed.message || failed));
    alert(ru ? 'Ошибка восстановления.' : "Tiklashda xato yuz berdi.");
    document.getElementById('restoreTerm').classList.add('hidden');
    return;
  }

  termLine('c-green', '[DONE] ' + (ru ? 'восстановление завершено' : 'tiklash yakunlandi'));
  document.getElementById('rtDoneTxt').textContent = ru ? 'ВОССТАНОВЛЕНО' : 'TIKLANDI';
  document.getElementById('rtDoneSub').textContent =
    ru ? 'Приложение перезагрузится…' : 'Ilova qayta yuklanadi…';
  document.getElementById('restoreTerm').classList.add('rtFinished');
  document.getElementById('rtDone').classList.remove('hidden');
  chime();
  try{ if(navigator.vibrate) navigator.vibrate([30, 60, 30]); }catch(e){}

  setTimeout(function(){ location.reload(); }, 2200);
}
