/* Unutilmas Ta'm — 17-motion.js
   Harakat faqat foydalanuvchi amaliga javob beradi.
   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

(function(){
  const reduced = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Bosilganda tarqaladigan to'lqin ──
     Barcha tugmalarga emas — faqat amal bajaradigan asosiy tugmalarga. */
  const RIPPLE_SEL = '.primaryBtn, .ghostBtn, .dlBtn2, .buyBtn2, .orderBtn2, ' +
                     '.tcOk, .tcNo, .sideMenuItem, .tallyTabs button';

  function ripple(e){
    if(reduced) return;
    const btn = e.target.closest(RIPPLE_SEL);
    if(!btn || btn.disabled) return;

    btn.classList.add('rippleHost');
    const r = btn.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    const size = Math.max(r.width, r.height) * 1.1;

    const dot = document.createElement('span');
    dot.className = 'rippleDot';
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = ((t.clientX - r.left) - size / 2) + 'px';
    dot.style.top  = ((t.clientY - r.top)  - size / 2) + 'px';
    btn.appendChild(dot);
    setTimeout(function(){ dot.remove(); }, 600);
  }
  document.addEventListener('pointerdown', ripple, {passive:true});

  /* ── Summa o'zgarganda sezilsin ──
     Savat jami, tez hisob paneli, chek jami — pul ko'rsatkichlari. */
  const MONEY_IDS = ['tallyBarSum', 'crTotalAmt', 'rTotalAmt',
                     'basketTotal', 'pdTotalVal', 'calcTotalVal'];

  function watchMoney(){
    if(reduced) return;
    MONEY_IDS.forEach(function(id){
      const el = document.getElementById(id);
      if(!el || el.__moneyWatch) return;
      el.__moneyWatch = true;
      let last = el.textContent;
      new MutationObserver(function(){
        if(el.textContent === last) return;
        last = el.textContent;
        el.classList.remove('amountPulse');
        void el.offsetWidth;          // animatsiyani qayta boshlash
        el.classList.add('amountPulse');
      }).observe(el, {childList:true, characterData:true, subtree:true});
    });
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', watchMoney);
  else watchMoney();

  /* Yangi element qo'shilganda ham kuzatuvni ulaymiz */
  setInterval(watchMoney, 2500);
})();
