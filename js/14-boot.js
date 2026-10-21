/* Unutilmas Ta'm — 14-boot
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

window.addEventListener('error', (e)=>{
  if(__diagShownOnce) return;
  __diagShownOnce = true;
  setTimeout(()=>{
    alert('DIAGNOSTIKA — kutilmagan xato topildi (buni screenshot qilib yuboring):\n\n' +
      (e.message||"noma'lum xato") + '\n\nFayl: ' + (e.filename||'-') + '\nQator: ' + (e.lineno||'-'));
  }, 100);
});

window.addEventListener('unhandledrejection', (e)=>{
  if(__diagShownOnce) return;
  __diagShownOnce = true;
  setTimeout(()=>{
    alert('DIAGNOSTIKA — kutilmagan (async) xato topildi (buni screenshot qilib yuboring):\n\n' +
      (e.reason && e.reason.message ? e.reason.message : e.reason));
  }, 100);
});

;

;

;

;

try{ keyTimes = JSON.parse(localStorage.getItem('utam_tmap') || '{}'); }

catch(e){ keyTimes = {}; }

;

try{ dirtyKeys = JSON.parse(localStorage.getItem('utam_dirty') || '{}'); }

catch(e){ dirtyKeys = {}; }

document.addEventListener('touchstart', ()=>{ __lastTouchTs = Date.now(); }, {passive:true, capture:true});

document.addEventListener('pointerdown', ()=>{ __lastTouchTs = Date.now(); }, {passive:true, capture:true});

document.addEventListener('click', ()=>{ __lastTouchTs = Date.now(); }, {passive:true, capture:true});

setInterval(__watchdogFixStuckOverlays, 2500);

window.addEventListener('online', ()=>scheduleFlush(300));

setInterval(()=>{ if(Object.keys(dirtyKeys).length) scheduleFlush(0); }, 20000);

(function captureAppLogo(){
  try{
    const el = document.querySelector('.splashLogoFull');
    if(el && el.src) APP_LOGO_B64 = el.src;
  }catch(e){}
})();

;

;

;

;

Object.keys(TR_RU).forEach(k=>{ TR_UZ[TR_RU[k]] = k; });

;

;

;

;

/* Xaritaning o'zi yoki boshqa joy bosilsa — panel yopiladi */
document.addEventListener('click', e=>{
  if(!e.target.closest || !e.target.closest('.mapTypeCtrl')) closeAllMapTypePanels();
}, true);

window.addEventListener('resize', ()=>{ if(fullLeafletMap && document.getElementById('v-fullmap').classList.contains('active')) fullLeafletMap.invalidateSize(); });

;

;

;

;

/* ==================== INIT ==================== */
(async function init(){
  mountIcons();
  applyDarkMode();
  await loadState();
  restoreSession();
  initRestoreModeIfNeeded();
  await initCourierModeIfNeeded();
  refreshShell();
  goHome();
  // TANISHTIRUV (ONBOARDING) AVTOMATIK CHIQISHI O'CHIRILDI:
  // bu funksiya turli holatlarda (masalan sessiya "yangi mehmon" deb hisoblansa)
  // butun ekranni — hatto "Kirish" tugmasining o'zini ham — to'sib qo'yib,
  // ilovani butunlay ishlatib bo'lmas holatga keltirib qo'yayotgani aniqlandi.
  // Funksiyaning o'zi kodda qoldi (kerak bo'lsa qo'lda chaqirish uchun), lekin
  // endi hech qachon avtomatik ishga tushmaydi.
  // Saqlangan til ruscha bo'lsa — ilova ochilishidayoq butun sahifaga qo'llanadi
  if(appLang === 'ru'){
    startTranslateObserver();
    setTimeout(()=>applyTranslations(), 300);
  }
  // Chiroyli logotipli splash-ekran: 1.4s ko'rsatiladi, so'ng ohista so'nadi.
  // MUHIM: agar telefon ekrani shu payt o'chib-yonsa yoki ilova fon rejimiga
  // o'tib qaytsa, brauzer animatsiya va setTimeout'larni "muzlatib qo'yishi"
  // mumkin — bu holda splash ko'rinmas holda qolib, BUTUN EKRANNI bosishlardan
  // to'sib qolar edi. Shuning uchun bir nechta mustaqil himoya qatlami qo'yildi:
  function forceRemoveSplash(){
    const s = document.getElementById('splashScreen');
    if(s && s.parentNode) s.remove();
  }
  function disableSplashClicks(){
    const s = document.getElementById('splashScreen');
    if(s) s.style.pointerEvents = 'none'; // ko'rinmasa ham, hech qachon bosishni to'smaydi
  }
  setTimeout(()=>{
    const s = document.getElementById('splashScreen');
    if(s){
      s.addEventListener('animationend', (e)=>{ if(e.animationName==='splashFadeOut') forceRemoveSplash(); });
    }
    disableSplashClicks(); // vizual holatidan qat'iy nazar, shu zahoti bosishga ruxsat beramiz
  }, 1300);
  setTimeout(forceRemoveSplash, 2200); // zaxira: animatsiya umuman ishlamasa ham
  // Ilova fon rejimidan qaytganda — splash hali ham tursa, darhol olib tashlaymiz
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible'){ disableSplashClicks(); forceRemoveSplash(); }
  });
  // Yakuniy xavfsizlik: foydalanuvchi istalgan joyni bossa, splash hali tursa — darhol yo'qotamiz
  document.addEventListener('pointerdown', ()=>{ disableSplashClicks(); }, {passive:true, capture:true});
})();

/* ── qolgan skript bloklari ── */

/* ═══════════════════════════════════════════════════════════════
   TEPADAN PASTGA TORTIB YANGILASH  (Pull to refresh)
   iPhone/Android'da ekranga qo'shilgan ilovada sahifani yangilash
   uchun. Sahifa eng tepada turganda barmoq bilan pastga tortiladi.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  /* Faqat asosiy kontent suriladi — #appShell emas! Aks holda pastki menyu
     (position:fixed) sahifa oxiriga tushib qolardi. */
  const shell  = document.querySelector('main');
  const box    = document.getElementById('ptrBox');
  const circle = document.getElementById('ptrCircle');
  if(!shell || !box || !circle) return;

  const TRIGGER  = 130;   // yangilanishi uchun shuncha siljish kerak (barmoq ~260px)
  const MAX_PULL = 210;   // maksimal cho'zilish
  const RESIST   = 0.50;  // qarshilik — barmoqdan sekinroq siljisin

  let startY = 0, pull = 0, dragging = false, refreshing = false;

  /* Modal, menyu yoki xarita ochiq bo'lsa — ishlamasin */
  function blocked(){
    if(refreshing) return true;
    if(document.querySelector('.modalBg:not(.hidden)')) return true;
    if(document.querySelector('.onboardingBg:not(.hidden)')) return true;
    const sm = document.getElementById('sideMenu');
    if(sm && sm.classList.contains('open')) return true;
    const fm = document.getElementById('v-fullmap');
    if(fm && fm.classList.contains('active')) return true;   // xaritada tortish xaritani suradi
    return false;
  }
  /* Ichki skroll qiluvchi ro'yxat ustidan tortilmasin */
  function insideScroller(el){
    while(el && el !== document.body){
      if(el.scrollHeight > el.clientHeight + 4){
        const st = getComputedStyle(el).overflowY;
        if(st === 'auto' || st === 'scroll') return el.scrollTop > 0 ? true : false;
      }
      el = el.parentElement;
    }
    return false;
  }
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  function setPull(px){
    pull = px;
    shell.style.transform = px ? `translateY(${px}px)` : '';
    box.style.height = px ? Math.min(px, MAX_PULL) + 'px' : '0px';
    const p = Math.min(px / TRIGGER, 1);
    circle.style.opacity   = p;
    circle.style.transform = `scale(${0.5 + p * 0.5}) rotate(${p * 180}deg)`;
    box.classList.toggle('ready', px >= TRIGGER);
  }
  function reset(anim){
    if(anim){
      shell.style.transition = 'transform .34s var(--spring-pop)';
      box.style.transition   = 'height .34s var(--spring-pop)';
      setTimeout(()=>{ shell.style.transition=''; box.style.transition=''; }, 360);
    }
    setPull(0);
    box.classList.remove('ready','spin');
    document.body.classList.remove('ptrActive');
  }

  async function doRefresh(){
    refreshing = true;
    box.classList.add('spin');
    box.classList.remove('ready');
    shell.style.transition = 'transform .28s var(--spring-pop)';
    shell.style.transform  = 'translateY(56px)';
    box.style.height = '56px';
    circle.style.opacity = 1;
    try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}

    /* MUHIM: yangilashdan oldin saqlanmagan o'zgarishlarni bulutga jo'natamiz,
       aks holda sahifa qayta yuklanganda ular yo'qolib ketardi. */
    try{
      await Promise.race([
        (async ()=>{
          if(typeof localSave === 'function') localSave();
          if(typeof flushCloud === 'function') await flushCloud();
        })(),
        new Promise(r => setTimeout(r, 2500))
      ]);
    }catch(e){ console.warn('Yangilashdan oldin saqlashda xato:', e); }
    location.reload();
  }

  document.addEventListener('touchstart', e=>{
    if(blocked() || e.touches.length !== 1) return;
    if(!atTop()) return;
    if(insideScroller(e.target)) return;
    startY = e.touches[0].clientY;
    dragging = true;
  }, {passive:true});

  document.addEventListener('touchmove', e=>{
    if(!dragging || blocked()) return;
    const dy = e.touches[0].clientY - startY;
    if(dy <= 0){                      // yuqoriga surildi — bekor qilamiz
      if(pull) setPull(0);
      dragging = false;
      document.body.classList.remove('ptrActive');
      return;
    }
    if(!atTop()){ dragging = false; if(pull) reset(true); return; }
    /* Oddiy bosish (tap) paytida barmoq biroz siljiydi — bu tortish emas.
       preventDefault() shu paytda bosishni "yutib yuborardi" (2-3 marta bosish kerak edi). */
    if(dy < 14 && !pull) return;
    document.body.classList.add('ptrActive');
    if(e.cancelable) e.preventDefault();   // brauzerning o'z "bounce"ini to'xtatamiz
    setPull(Math.min(dy * RESIST, MAX_PULL));
  }, {passive:false});

  function endDrag(){
    if(!dragging) return;
    dragging = false;
    if(pull >= TRIGGER) doRefresh();
    else if(pull) reset(true);
    else document.body.classList.remove('ptrActive');
  }
  document.addEventListener('touchend', endDrag, {passive:true});
  document.addEventListener('touchcancel', endDrag, {passive:true});
})();

/* ═══════════════════════════════════════════════════════════════
   INTERNET HOLATI — pastda tasma ko'rsatiladi.
   Internet yo'qolganda ogohlantiradi, qaytganda yashil xabar
   berib o'zi yopiladi. Ilova offline'da ham ishlashda davom etadi.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const bar = document.getElementById('offlineBar');
  const txt = document.getElementById('offlineBarTxt');
  if(!bar || !txt) return;
  let hideTimer = null;

  function goOffline(){
    clearTimeout(hideTimer);
    bar.classList.remove('online');
    txt.textContent = "Internet aloqasi yo'q — ilova xotiradagi ma'lumot bilan ishlayapti";
    bar.classList.add('show');
  }
  function goOnline(){
    clearTimeout(hideTimer);
    bar.classList.add('online');
    txt.textContent = "Internet qaytdi — ma'lumotlar sinxronlanmoqda";
    bar.classList.add('show');
    /* Kutib turgan o'zgarishlarni darhol bulutga jo'natamiz */
    try{ if(typeof flushCloud === 'function') flushCloud(); }catch(e){}
    hideTimer = setTimeout(()=>bar.classList.remove('show'), 3200);
  }

  window.addEventListener('offline', goOffline);
  window.addEventListener('online', goOnline);
  /* Ilova ochilganda internet yo'q bo'lsa darhol bildiramiz */
  if(!navigator.onLine) setTimeout(goOffline, 900);
})();

/* PWA: service worker (faqat https yoki localhost'da ishlaydi; fayl sifatida ochilganda jim o'tadi) */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=80', { scope: '/' }).then(reg => {
      /* Yangi versiya topilsa — darhol almashtirish */
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage('SKIP_WAITING');
          }
        });
      });
      /* Har ochilganda yangilanishni tekshirish */
      setTimeout(() => reg.update().catch(()=>{}), 3000);
    }).catch(e => console.log('SW xatosi:', e));
  });
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded) return;
    swReloaded = true;
    location.reload();
  });
}
