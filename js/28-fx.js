/* Unutilmas Ta'm — 28-fx.js  (v14.1)  Premium Touch
   Har bir bosishga jonli javob: to'lqin, ikonka animatsiyasi,
   uchqunlar, yengil tebranish (Android), kartochka yorug'ligi.
   Ilova mantiqiga tegmaydi; xato bo'lsa jim o'tadi. */
/* ── Qo'shimcha SVG ikonkalar (ICONS ga qo'shiladi) ── */
(function(){
  try{
    if(typeof ICONS === 'undefined') return;
    const X = {
      bolt:    '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
      printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
      pulse:   '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
      ticket:  '<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5Z"/><path d="M14 6v2M14 11v2M14 16v2"/>',
      zone:    '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>',
      gift:    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
      sparkles:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6L5 16Z"/>',
      wallet:  '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2"/><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z"/><circle cx="16.5" cy="13.5" r="1.2"/>'
    };
    Object.keys(X).forEach(function(k){ if(!ICONS[k]) ICONS[k] = X[k]; });
  }catch(e){}
})();

(function(){
  'use strict';
  const reduced = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#CEA256','#CA7339','#AF6A80','#7693BC','#4F81A0','#4D9655'];

  /* 17-motion.js allaqachon to'lqin beradigan tugmalar — ikki marta bermaymiz */
  const OLD_RIPPLE = '.primaryBtn, .ghostBtn, .dlBtn2, .buyBtn2, .orderBtn2, .tcOk, .tcNo, .sideMenuItem, .tallyTabs button';
  /* To'lqin beriladigan bosiluvchi elementlar */
  const TAP_SEL = 'button, [onclick], .prodCard, .statCard.clickable, .catCard, .chatListItem, ' +
                  '.contactRow, .blRow, .notifCardClick, .langOption, .mapTypeOpt, .mpRow, .finRow, .debtRowHead';
  /* Fon (backdrop) va katta konteynerlar — to'lqinsiz */
  const SKIP_SEL = '.modalBg, .sideMenuOverlay, .imgViewerBg, .onboardingBg, .callScreenBg, .mapShell, input, textarea, select';
  /* Kichik yumshoq to'lqin (och rangli yuzalar uchun to'q to'lqin) */
  const LIGHT_HOST = '.ghostBtn, .dlBtn2, .catChip:not(.active), .quickAddBtn2, .tinyIconBtn, .iconBtn, .rightBtn, ' +
                     '.chatIconBtn, .prodCard, .card, .blRow, .chatListItem, .contactRow, .statCard, .mpRow, ' +
                     '.langOption, .notifCardClick, .catCard, .finRow, .sideMenuItem, .pdQtyBox button, .favHeartBtn, .favHeartBtn2';
  const SPARK_SEL = '.primaryBtn, .buyBtn2, .orderBtn2, .tcOk, .quickAddBtn2, .floatBasket, .mpUse';

  function vibrate(ms){
    try{ if(!reduced && navigator.vibrate) navigator.vibrate(ms); }catch(e){}
  }

  /* ── 1. Bosish: to'lqin (har bir bosiluvchi elementda) ── */
  function ripple(e){
    if(reduced) return;
    const host = e.target.closest && e.target.closest(TAP_SEL);
    if(!host || host.disabled || host.closest(SKIP_SEL) === host) return;
    if(host.matches(OLD_RIPPLE)) return;
    const r = host.getBoundingClientRect();
    /* butun ekran kattaligidagi yuzalarga to'lqin bermaymiz */
    if(r.width > window.innerWidth * .96 && r.height > 240) return;
    if(r.width < 8 || r.height < 8) return;

    const cs = getComputedStyle(host);
    if(cs.position === 'static') host.style.position = 'relative';

    let ring = host.querySelector(':scope > .fxRing');
    if(!ring){
      ring = document.createElement('span');
      ring.className = 'fxRing';
      host.appendChild(ring);
    }
    const t = (e.touches && e.touches[0]) || e;
    const size = Math.max(r.width, r.height) * 1.1;
    const dot = document.createElement('span');
    dot.className = 'fxRipple' + (host.matches(LIGHT_HOST) ? ' dark' : '');
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = ((t.clientX - r.left) - size / 2) + 'px';
    dot.style.top  = ((t.clientY - r.top)  - size / 2) + 'px';
    ring.appendChild(dot);
    setTimeout(function(){ dot.remove(); }, 650);
  }

  /* ── 2. Qo'yib yuborilganda: ikonka animatsiyasi + yengil tebranish ── */
  function tap(e){
    const host = e.target.closest && e.target.closest(TAP_SEL);
    if(!host || host.disabled) return;
    if(host.closest(SKIP_SEL) === host) return;
    vibrate(6);
    if(reduced || !host.querySelector('svg')) return;
    host.classList.remove('fxTap');
    void host.offsetWidth;                     // animatsiyani qayta boshlash
    host.classList.add('fxTap');
    clearTimeout(host.__tapT);
    host.__tapT = setTimeout(function(){ host.classList.remove('fxTap'); }, 700);
  }

  /* ── 3. Asosiy tugmalarda rangli uchqunlar ── */
  function burst(e){
    if(reduced) return;
    const btn = e.target.closest && e.target.closest(SPARK_SEL);
    if(!btn || btn.disabled) return;
    const n = 8;
    for(let i = 0; i < n; i++){
      const s = document.createElement('span');
      s.className = 'fxSpark';
      const a = (Math.PI * 2 * i / n) + Math.random() * .6;
      const d = 24 + Math.random() * 30;
      s.style.left = (e.clientX - 3) + 'px';
      s.style.top  = (e.clientY - 3) + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.setProperty('--c', COLORS[(Math.random() * COLORS.length) | 0]);
      document.body.appendChild(s);
      setTimeout(function(){ s.remove(); }, 700);
    }
  }

  /* ── 4. Mahsulot kartochkasi: barmoq/sichqoncha ostidagi yorug' dog' ── */
  function spot(e){
    const card = e.target.closest && e.target.closest('.prodCard');
    if(!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    if(e.pointerType && e.pointerType !== 'mouse'){
      card.classList.add('spot');
      clearTimeout(card.__spotT);
      card.__spotT = setTimeout(function(){ card.classList.remove('spot'); }, 550);
    }
  }

  document.addEventListener('pointerdown', function(e){
    try{ ripple(e); burst(e); spot(e); }catch(err){}
  }, {passive:true});
  document.addEventListener('pointermove', function(e){
    if(e.pointerType === 'mouse'){ try{ spot(e); }catch(err){} }
  }, {passive:true});
  document.addEventListener('click', function(e){
    try{ tap(e); }catch(err){}
  }, {passive:true});

  /* ── 5. Skroll: yuqori panel chuqurroq bo'ladi ── */
  let ticking = false;
  window.addEventListener('scroll', function(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(function(){
      document.body.classList.toggle('fxScrolled', window.scrollY > 8);
      ticking = false;
    });
  }, {passive:true});
})();

/* ── Pastki menyu ovali: siljiganda "suv tomchisi"dek cho'ziladi va yig'iladi ── */
(function(){
  'use strict';
  function init(){
    const g = document.getElementById('navGlider');
    if(!g || g.__drop) return;
    g.__drop = true;
    let last = null, t = null;
    function px(v){ const m = /translateX\((-?[\d.]+)px\)/.exec(v || ''); return m ? parseFloat(m[1]) : null; }
    new MutationObserver(function(){
      const cur = px(g.style.transform);
      if(cur === null) return;
      if(last === null){ last = cur; return; }
      if(cur === last) return;
      const dist = Math.abs(cur - last);
      last = cur;
      g.style.setProperty('--sx', (1 + Math.min(dist / 260, .30)).toFixed(3));
      g.classList.remove('drop');
      void g.offsetWidth;
      g.classList.add('drop');
      clearTimeout(t);
      t = setTimeout(function(){ g.classList.remove('drop'); }, 760);
    }).observe(g, {attributes:true, attributeFilter:['style']});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  /* navGlider buildNav() ichida yaratiladi — paydo bo'lguncha kutamiz */
  let tries = 0;
  const iv = setInterval(function(){
    init();
    if((document.getElementById('navGlider') && document.getElementById('navGlider').__drop) || ++tries > 40) clearInterval(iv);
  }, 250);
  /* buildNav qayta chizsa (til/rol o'zgarsa) glider yangi bo'ladi */
  new MutationObserver(function(){ init(); }).observe(document.body, {childList:true, subtree:true});
})();
