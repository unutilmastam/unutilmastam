/* Unutilmas Ta'm — 27-rewards.js
   ═══════════════════════════════════════════════════════════════
   BONUSLAR: ball, promo-kod, referal, bonus to'lovi

   Muammo: ball tizimi yoqilgan holda turardi va admin uni
   boshqara olmasdi — magazin egasi ballarini ishlatib yuborsa
   tushunmovchilik chiqardi.

   Endi hammasi bitta joydan boshqariladi: yon menyu -> BONUSLAR.
   Har bir funksiyani alohida yoqish/o'chirish va sozlash mumkin.

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

/* ───────── Sozlamalar ───────── */
const RW_DEFAULT = {
  points:   { on: false, perSom: 1000, value: 100 },   // har 1000 so'mga 1 ball; 1 ball = 100 so'm
  referral: { on: false, need: 5, prize: 5000 },
  gift:     { on: false, qty: 100, percent: 10, maxItems: 5, days: 30 }
};

function rw(){
  state.rewards = state.rewards || {};
  ['points', 'referral', 'gift'].forEach(function(k){
    state.rewards[k] = Object.assign({}, RW_DEFAULT[k], state.rewards[k] || {});
  });
  return state.rewards;
}

/* Umumiy BONUSLAR kaliti — o'chirilgan bo'lsa, mijoz va magazin egasi
   profilida hech qanday bonus/ball/promo-kod/referal ko'rinmaydi va
   ular ishlamaydi ham (lekin admin sozlamalari saqlanib qoladi —
   qayta yoqilganda hammasi avvalgidek tiklanadi). */
function bonusEnabled(){
  state.rewards = state.rewards || {};
  return state.rewards.enabled !== false;
}
function toggleBonusMaster(){
  if(!currentUser || currentUser.role !== 'admin') return;
  state.rewards = state.rewards || {};
  state.rewards.enabled = !bonusEnabled();
  saveState();
  syncBonusMasterUI();
  try{ renderCabinet(); }catch(e){}
}
function syncBonusMasterUI(){
  const on = bonusEnabled();
  const sw = document.getElementById('bonusMasterSwitch');
  if(sw) sw.classList.toggle('on', on);
  const lbl = document.getElementById('bonusMasterState');
  if(lbl) lbl.textContent = on ? 'Yoqilgan' : "O'chirilgan — mijozlarga ko'rinmaydi";
}
function pointsOn(){ return bonusEnabled() && !!rw().points.on; }
function pointValue(){ return Number(rw().points.value) || 100; }
function pointsPerSom(){ return Number(rw().points.perSom) || 1000; }

/* ───────── Hisob (bonus / referal pullari) ─────────
   Foydalanuvchi hisobidagi pul — keyingi xariddan ayiriladi. */
function userBalance(userId){
  const u = (state.users || []).find(x => x.id === userId);
  return u ? (Number(u.balance) || 0) : 0;
}

async function addBalance(userId, amount, reason){
  const u = (state.users || []).find(x => x.id === userId);
  if(!u || !amount) return;
  u.balance = (Number(u.balance) || 0) + Number(amount);
  u.balanceLog = u.balanceLog || [];
  u.balanceLog.push({ ts: Date.now(), amount: Number(amount), reason: reason || '' });
  await saveState();
  try{
    pushNotification(userId, '💰 Hisobingizga pul tushdi',
      fmt(amount) + " so'm — " + (reason || 'bonus') + ". Keyingi xaridda ishlatiladi.", 'balance', null);
  }catch(e){}
}

/* ───────── Promo-kod: chegirma faqat N donaga ─────────
   Masalan 5 donagacha — 7 dona olsa, faqat 5 donasiga chegirma. */
function promoDiscountFor(promo, items){
  if(!promo) return 0;
  const pct = Number(promo.discountPercent) || 0;
  if(!pct) return 0;
  const limit = Number(promo.maxItems) || 0;

  if(!limit){
    const sum = items.reduce((a, i) => a + i.price * i.qty, 0);
    return Math.round(sum * pct / 100);
  }
  /* qimmatroq donalardan boshlab N tasiga qo'llaymiz — mijoz foydasiga */
  const units = [];
  items.forEach(function(i){ for(let k = 0; k < i.qty; k++) units.push(i.price); });
  units.sort(function(a, b){ return b - a; });
  const base = units.slice(0, limit).reduce(function(a, p){ return a + p; }, 0);
  return Math.round(base * pct / 100);
}

/* Savatdagi mahsulotlar ro'yxati */
function basketItems(){
  return Object.entries(basket || {}).map(function(e){
    const p = (state.products || []).find(x => x.id === e[0]);
    return p ? { price: priceOf(p), qty: e[1] } : null;
  }).filter(Boolean);
}

/* ───────── Referal ───────── */
function refLink(userId){
  return location.origin + '/?ref=' + encodeURIComponent(userId);
}

function refCount(userId){
  return (state.users || []).filter(u => u.referredBy === userId).length;
}

/* Ro'yxatdan o'tgan yangi foydalanuvchini taklif qilganga bog'laydi */
async function attachReferral(newUser){
  const r = rw().referral;
  if(!bonusEnabled() || !r.on || !newUser) return;
  let ref = '';
  try{ ref = localStorage.getItem('utam_ref') || ''; }catch(e){}
  if(!ref) { try{ ref = new URLSearchParams(location.search).get('ref') || ''; }catch(e){} }
  if(!ref || ref === newUser.id) return;
  const inviter = (state.users || []).find(u => u.id === ref);
  if(!inviter) return;

  newUser.referredBy = inviter.id;
  try{ localStorage.removeItem('utam_ref'); }catch(e){}

  /* chegaraga yetdimi? */
  const cnt = refCount(inviter.id);
  const given = Number(inviter.refPrizes) || 0;
  const earned = Math.floor(cnt / (Number(r.need) || 5));
  if(earned > given){
    inviter.refPrizes = earned;
    await addBalance(inviter.id, (earned - given) * (Number(r.prize) || 0),
                     'Referal mukofoti (' + cnt + ' kishi)');
  }else{
    await saveState();
  }
}

/* Havoladan kelgan bo'lsa eslab qolamiz — ro'yxatdan o'tgach ishlatiladi */
(function(){
  try{
    const ref = new URLSearchParams(location.search).get('ref');
    if(ref) localStorage.setItem('utam_ref', ref);
  }catch(e){}
})();

/* ───────── Sovg'a qutisi ─────────
   Katta xarid qilganda ekranda quti ochiladi va ichidan promo-kod chiqadi. */
function genPromoCode(){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return 'SOVGA' + s;
}

async function maybeGiftBox(userId, totalQty){
  const g = rw().gift;
  if(!bonusEnabled() || !g.on || !userId) return null;
  if(totalQty < (Number(g.qty) || 0)) return null;

  const code = genPromoCode();
  const exp = new Date(Date.now() + (Number(g.days) || 30) * 86400000);
  state.promoCodes = state.promoCodes || [];
  state.promoCodes.push({
    id: uid('pc'), code: code,
    discountPercent: Number(g.percent) || 0,
    maxItems: Number(g.maxItems) || 0,
    usageLimit: 1, usedCount: 0, active: true,
    ownerUserId: userId, source: 'gift',
    expiresAt: exp.toISOString().slice(0, 10)
  });
  await saveState();
  try{
    pushNotification(userId, '🎁 Sizga sovg\'a!',
      code + " — " + (g.percent) + "% chegirma (" + g.maxItems + " donagacha). " +
      "Amal qiladi: " + exp.toISOString().slice(0, 10), 'gift', null);
  }catch(e){}
  showGiftBox(code, g);
  return code;
}

function showGiftBox(code, g){
  let el = document.getElementById('giftBox');
  if(!el){
    el = document.createElement('div');
    el.id = 'giftBox';
    el.className = 'noTr';
    document.body.appendChild(el);
  }
  const conf = [];
  for(let i = 0; i < 40; i++){
    const c = ['#AC6437', '#C5933D', '#528F53', '#6594B3', '#AF6A84'][i % 5];
    conf.push(`<i style="left:${Math.random()*100}%;background:${c};
      animation-delay:${(Math.random()*0.5).toFixed(2)}s;
      transform:rotate(${Math.floor(Math.random()*360)}deg)"></i>`);
  }
  el.innerHTML = `
    <div class="gbConfetti">${conf.join('')}</div>
    <div class="gbCard">
      <div class="gbBox">
        <div class="gbLid"></div>
        <div class="gbBody"></div>
        <div class="gbRibbon"></div>
      </div>
      <div class="gbTitle">Tabriklaymiz!</div>
      <div class="gbText">Katta xarid uchun sovg'a promo-kod</div>
      <div class="gbCode" onclick="copyGiftCode('${code}')">${code}</div>
      <div class="gbHint">${g.percent}% chegirma · ${g.maxItems} donagacha</div>
      <button class="primaryBtn" style="width:100%;margin-top:14px;" onclick="closeGiftBox()">Oldim</button>
    </div>`;
  el.classList.remove('hidden');
  try{ if(navigator.vibrate) navigator.vibrate([20, 60, 20, 60, 40]); }catch(e){}
}

function closeGiftBox(){
  const el = document.getElementById('giftBox');
  if(el) el.classList.add('hidden');
}

function copyGiftCode(code){
  try{ navigator.clipboard.writeText(code); alert('Nusxalandi: ' + code); }catch(e){}
}

/* ───────── Yon menyu: BONUSLAR guruhi ───────── */
function toggleRewardsGroup(){
  const w = document.getElementById('rewardsGroup');
  const b = document.getElementById('rewardsToggle');
  if(!w) return;
  const open = !w.classList.contains('open');
  w.classList.toggle('open', open);
  if(b) b.classList.toggle('open', open);
}

/* ───────── Sozlamalar oynalari ───────── */
function openRewardSettings(kind){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const s = rw();
  const box = document.getElementById('rwBody');
  const T = {
    points:   'Ball tizimi',
    referral: 'Referal (taklif qilish)',
    gift:     'Sovg\'a qutisi (promo-kod)'
  };
  document.getElementById('rwTitle').textContent = T[kind] || 'Sozlamalar';
  window.__rwKind = kind;

  if(kind === 'points'){
    const p = s.points;
    box.innerHTML = `
      <label class="bnToggle"><input type="checkbox" id="rwOn" ${p.on ? 'checked' : ''}> <span>Ball tizimi yoqilgan</span></label>
      <p class="smallMuted" style="font-size:11.5px;line-height:1.5;margin:8px 0 12px;">
        O'chirilsa: mijozlarga ball berilmaydi va savatda ball ishlatish imkoni yo'qoladi.
        Yig'ilgan ballar saqlanib qoladi.</p>
      <div class="field"><label>Necha so'mga 1 ball beriladi</label>
        <input id="rwA" type="text" inputmode="numeric" value="${fmt(p.perSom)}" oninput="onDebtAmountInput(this); rwPreview()"></div>
      <div class="field"><label>1 ball necha so'mga teng</label>
        <input id="rwB" type="text" inputmode="numeric" value="${fmt(p.value)}" oninput="onDebtAmountInput(this); rwPreview()"></div>
      <div class="prnDebtNote" id="rwPrev"></div>`;
  }else if(kind === 'referral'){
    const r = s.referral;
    box.innerHTML = `
      <label class="bnToggle"><input type="checkbox" id="rwOn" ${r.on ? 'checked' : ''}> <span>Referal yoqilgan</span></label>
      <p class="smallMuted" style="font-size:11.5px;line-height:1.5;margin:8px 0 12px;">
        Foydalanuvchi o'z havolasini tarqatadi. Havola orqali kerakli sondagi
        odam ro'yxatdan o'tsa — unga pul mukofoti beriladi va u keyingi
        xaridda ishlatiladi.</p>
      <div class="field"><label>Necha kishi ro'yxatdan o'tsa</label>
        <input id="rwA" type="text" inputmode="numeric" value="${r.need}" oninput="rwPreview()"></div>
      <div class="field"><label>Mukofot (so'm)</label>
        <input id="rwB" type="text" inputmode="numeric" value="${fmt(r.prize)}" oninput="onDebtAmountInput(this); rwPreview()"></div>
      <div class="prnDebtNote" id="rwPrev"></div>`;
  }else{
    const g = s.gift;
    box.innerHTML = `
      <label class="bnToggle"><input type="checkbox" id="rwOn" ${g.on ? 'checked' : ''}> <span>Sovg'a qutisi yoqilgan</span></label>
      <p class="smallMuted" style="font-size:11.5px;line-height:1.5;margin:8px 0 12px;">
        Belgilangan miqdordan ko'p mahsulot olgan mijozga ekranda quti
        ochiladi va ichidan promo-kod chiqadi.</p>
      <div class="field"><label>Necha dona olganda sovg'a beriladi</label>
        <input id="rwA" type="text" inputmode="numeric" value="${g.qty}" oninput="rwPreview()"></div>
      <div class="field"><label>Chegirma (%)</label>
        <input id="rwB" type="text" inputmode="numeric" value="${g.percent}" oninput="rwPreview()"></div>
      <div class="field"><label>Necha donaga chegirma qo'llanadi</label>
        <input id="rwC" type="text" inputmode="numeric" value="${g.maxItems}" oninput="rwPreview()"></div>
      <div class="field"><label>Amal qilish muddati (kun)</label>
        <input id="rwD" type="text" inputmode="numeric" value="${g.days}" oninput="rwPreview()"></div>
      <div class="prnDebtNote" id="rwPrev"></div>`;
  }
  rwPreview();
  openModal('modalRewardSettings');
}

function rwNum(id){
  const el = document.getElementById(id);
  return el ? (parseMoney(el.value) || 0) : 0;
}

function rwPreview(){
  const k = window.__rwKind, el = document.getElementById('rwPrev');
  if(!el) return;
  if(k === 'points'){
    const a = rwNum('rwA') || 1, b = rwNum('rwB');
    el.innerHTML = `100 000 so'mlik xarid -> <b>${Math.floor(100000 / a)} ball</b> -> ` +
                   `<b>${fmt(Math.floor(100000 / a) * b)} so'm</b> chegirma`;
  }else if(k === 'referral'){
    el.innerHTML = `<b>${rwNum('rwA')}</b> kishi ro'yxatdan o'tsa — <b>${fmt(rwNum('rwB'))} so'm</b>`;
  }else{
    el.innerHTML = `<b>${rwNum('rwA')}</b> donadan ko'p olganda — <b>${rwNum('rwB')}%</b> chegirma, ` +
                   `<b>${rwNum('rwC')}</b> donagacha, <b>${rwNum('rwD')}</b> kun amal qiladi`;
  }
}

async function saveRewardSettings(){
  const k = window.__rwKind, s = rw();
  const on = document.getElementById('rwOn').checked;
  if(k === 'points'){
    s.points = { on: on, perSom: rwNum('rwA') || 1000, value: rwNum('rwB') || 100 };
  }else if(k === 'referral'){
    s.referral = { on: on, need: rwNum('rwA') || 5, prize: rwNum('rwB') || 0 };
  }else{
    s.gift = { on: on, qty: rwNum('rwA') || 100, percent: rwNum('rwB') || 0,
               maxItems: rwNum('rwC') || 0, days: rwNum('rwD') || 30 };
  }
  await saveState();
  closeModal('modalRewardSettings');
  try{ basketUpdateTotal(); }catch(e){}
}


/* ───────── Savatga uchib tushish ───────── */
function flyToBasket(fromEl){
  try{
    const target = document.getElementById('navBasketBadge') ||
                   document.querySelector('#nav-savat') ||
                   document.querySelector('.bottomNav .navBtn');
    if(!fromEl || !target) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'flyDot';
    const img = fromEl.querySelector('img');
    if(img) dot.style.backgroundImage = 'url(' + img.src + ')';
    dot.style.left = (a.left + a.width / 2 - 22) + 'px';
    dot.style.top  = (a.top + a.height / 2 - 22) + 'px';
    document.body.appendChild(dot);
    requestAnimationFrame(function(){
      dot.style.transform = 'translate(' + (b.left + b.width/2 - a.left - a.width/2) + 'px,' +
                            (b.top + b.height/2 - a.top - a.height/2) + 'px) scale(.18)';
      dot.style.opacity = '.25';
    });
    setTimeout(function(){
      dot.remove();
      const badge = document.getElementById('navBasketBadge');
      if(badge){ badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    }, 620);
  }catch(e){}
}

/* Savatga qo'shadigan tugmalarga ulaymiz */
document.addEventListener('click', function(e){
  const btn = e.target.closest('.quickAddBtn2, .buyBtn2, #pdAddBtn, [data-fly]');
  if(!btn) return;
  const card = btn.closest('.prodCard') || btn.closest('.pdCard') || btn;
  flyToBasket(card.querySelector('.prodImg') || card);
}, true);


/* Bonus — barcha magazinlar bo'yicha qisqa ro'yxat */
function openBonusList(){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const rows = (state.stores || []).map(function(s){
    const st = (typeof bonusState === 'function') ? bonusState(s.id) : null;
    if(!st) return `<button class="blRow off" onclick="closeModal('modalBonusList'); openBonusSettings('${s.id}')">
        <span class="blName">${s.name}</span><span class="blOff">yoqilmagan</span></button>`;
    return `<button class="blRow ${st.reached ? 'ready' : ''}" onclick="closeModal('modalBonusList'); openStoreDetail('${s.id}')">
      <span class="blMain">
        <span class="blName">${s.name}${st.reached ? ' 🎁' : ''}</span>
        <span class="blBar"><i style="width:${st.pct}%"></i></span>
      </span>
      <span class="blRight">${st.reached ? fmt(st.amount) + " so'm" : st.pct + '%'}</span>
    </button>`;
  }).join('');
  document.getElementById('bonusListBody').innerHTML =
    rows || `<p class="smallMuted">Magazin yo'q</p>`;
  openModal('modalBonusList');
}


/* ═══════════════════════════════════════════════════════════════
   MAGAZIN EGASINING PROFILI: sovg'a chizig'i, promo-kodlar, referal

   Sovg'a endi BITTA buyurtmadan emas — xaridlar YIG'ILIB boradi.
   Chiziq to'lgach promo-kod beriladi va hisob noldan boshlanadi.
   ═══════════════════════════════════════════════════════════════ */

/* Xarid miqdorini yig'ib boradi; chegaraga yetsa sovg'a beradi */
async function addGiftProgress(userId, qty){
  const g = rw().gift;
  if(!bonusEnabled() || !g.on || !userId || !qty) return null;
  const u = (state.users || []).find(x => x.id === userId);
  if(!u) return null;

  u.giftQty = (Number(u.giftQty) || 0) + Number(qty);
  const target = Number(g.qty) || 0;
  if(target <= 0 || u.giftQty < target){ await saveState(); return null; }

  u.giftQty -= target;                 // ortiqchasi keyingi davrga o'tadi
  const code = await issueGiftCode(userId, g);
  return code;
}

/* Promo-kodni yaratib, foydalanuvchiga biriktiradi */
async function issueGiftCode(userId, g){
  g = g || rw().gift;
  const code = genPromoCode();
  const exp = new Date(Date.now() + (Number(g.days) || 30) * 86400000);
  state.promoCodes = state.promoCodes || [];
  state.promoCodes.push({
    id: uid('pc'), code: code,
    discountPercent: Number(g.percent) || 0,
    maxItems: Number(g.maxItems) || 0,
    usageLimit: 1, usedCount: 0, active: true,
    ownerUserId: userId, source: 'gift',
    expiresAt: exp.toISOString().slice(0, 10)
  });
  await saveState();
  try{
    pushNotification(userId, "🎁 Sizga sovg'a!",
      code + " — " + g.percent + "% chegirma (" + g.maxItems + " donagacha). Amal qiladi: " +
      exp.toISOString().slice(0, 10), 'gift', null);
  }catch(e){}
  if(currentUser && currentUser.id === userId) showGiftBox(code, g);
  return code;
}

/* Foydalanuvchining ishlatilmagan promo-kodlari */
function myPromoCodes(userId){
  const today = todayISO();
  return (state.promoCodes || []).filter(function(p){
    return p.ownerUserId === userId && p.active &&
           (p.usedCount || 0) < (p.usageLimit || 1) &&
           (!p.expiresAt || p.expiresAt >= today);
  });
}

/* ───────── Profil bo'limlari ───────── */
function giftProgressHtml(userId){
  if(!bonusEnabled()) return '';
  const g = rw().gift;
  if(!g.on) return '';
  const u = (state.users || []).find(x => x.id === userId) || {};
  const have = Number(u.giftQty) || 0;
  const target = Number(g.qty) || 1;
  const pct = Math.min(100, Math.round(have / target * 100));
  const left = Math.max(0, target - have);

  return `
    <div class="card giftCard">
      <div class="cardTitle"><span class="ttIc ttGold">${ic('gift',15)}</span>Sovg'agacha</div>
      <div class="gpBar"><i style="width:${pct}%"></i></div>
      <div class="gpNums"><b>${have}</b><span>/ ${target} dona · ${pct}%</span></div>
      <div class="gpLeft">${left > 0
        ? `Yana <b>${left} dona</b> oling — ${g.percent}% chegirmali promo-kod sovg'a`
        : `Sovg'a tayyor!`}</div>
    </div>`;
}

function myPromoHtml(userId){
  if(!bonusEnabled()) return '';
  const list = myPromoCodes(userId);
  if(!list.length) return '';
  return `
    <div class="card">
      <div class="cardTitle"><span class="ttIc ttBerry">${ic('sparkles',15)}</span>Mening promo-kodlarim</div>
      ${list.map(function(p){
        return `<div class="mpRow">
          <div class="mpCode" onclick="copyGiftCode('${p.code}')">${p.code}</div>
          <div class="mpInfo">${p.discountPercent}% chegirma${p.maxItems ? ' · ' + p.maxItems + ' donagacha' : ''}
            ${p.expiresAt ? `<span class="mpExp">${p.expiresAt} gacha</span>` : ''}</div>
          <button class="ghostBtn mpUse" onclick="usePromoFromProfile('${p.code}')">Ishlatish</button>
        </div>`;
      }).join('')}
      <p class="smallMuted" style="font-size:11px;margin:6px 0 0;">
        Kodni bosib nusxalang yoki "Ishlatish" bilan savatga qo'llang.</p>
    </div>`;
}

function usePromoFromProfile(code){
  const inp = document.getElementById('promoInput');
  if(inp){ inp.value = code; }
  closeModal('modalProfile');
  try{
    renderBasketModal(); openModal('modalBasket');
    setTimeout(function(){
      const i2 = document.getElementById('promoInput');
      if(i2){ i2.value = code; applyPromoCode(); }
    }, 300);
  }catch(e){ alert('Kod: ' + code + "\n\nSavatda promo-kod maydoniga kiriting."); }
}

function referralHtml(userId){
  if(!bonusEnabled()) return '';
  const r = rw().referral;
  if(!r.on) return '';
  const cnt = refCount(userId);
  const need = Number(r.need) || 5;
  const toNext = need - (cnt % need);
  const pct = Math.round(((cnt % need) / need) * 100);
  const link = refLink(userId);
  const earned = Number((state.users || []).find(u => u.id === userId)?.refPrizes || 0);

  return `
    <div class="card refCard">
      <div class="cardTitle"><span class="ttIc ttCool">${ic('users',15)}</span>Do'stlarni taklif qiling</div>
      <p class="smallMuted" style="font-size:11.5px;line-height:1.5;margin:0 0 10px;">
        Havolangizni yuboring. <b>${need} kishi</b> ro'yxatdan o'tsa —
        <b>${fmt(r.prize)} so'm</b> hisobingizga tushadi.</p>
      <div class="refLinkRow">
        <input id="refLinkInput" type="text" readonly value="${link}">
        <button class="refCopy" onclick="copyRefLink()">Nusxa</button>
      </div>
      <button class="primaryBtn" style="width:100%;margin-top:8px;" onclick="shareRefLink()">Do'stlarga yuborish</button>
      <div class="gpBar" style="margin-top:12px;"><i style="width:${pct}%"></i></div>
      <div class="gpNums"><b>${cnt}</b><span>kishi ro'yxatdan o'tgan</span></div>
      <div class="gpLeft">Yana <b>${toNext} kishi</b> — keyingi mukofotgacha${
        earned ? ` · olingan: <b>${earned} marta</b>` : ''}</div>
    </div>`;
}

function copyRefLink(){
  const i = document.getElementById('refLinkInput');
  if(!i) return;
  try{ i.select(); navigator.clipboard.writeText(i.value); alert('Havola nusxalandi'); }catch(e){}
}

function shareRefLink(){
  const link = refLink(currentUser.id);
  const text = "Unutilmas Ta'm — mahsulot buyurtma qilish ilovasi. Shu havola orqali kiring:";
  if(navigator.share){
    navigator.share({ title: "Unutilmas Ta'm", text: text, url: link }).catch(function(){});
  }else{
    try{ navigator.clipboard.writeText(text + ' ' + link); alert('Havola nusxalandi — do\'stlaringizga yuboring'); }catch(e){}
  }
}

/* Profil oynasiga qo'shamiz */
(function(){
  if(typeof openProfileModal !== 'function') return;
  const orig = openProfileModal;
  openProfileModal = function(){
    orig.apply(this, arguments);
    try{
      if(!currentUser || currentUser.role === 'admin') return;
      const rows = document.getElementById('pfRows');
      if(!rows) return;
      let box = document.getElementById('pfRewards');
      if(!box){
        box = document.createElement('div');
        box.id = 'pfRewards';
        rows.parentNode.insertBefore(box, rows.nextSibling);
      }
      if(!bonusEnabled()){ box.innerHTML = ''; return; }
      const hisob = userBalance(currentUser.id);
      box.innerHTML =
        (hisob ? `<div class="card balCard"><div class="cardTitle"><span class="ttIc ttMint">${ic('wallet',15)}</span>Hisobim</div>
            <div class="balBig">${fmt(hisob)} so'm</div>
            <p class="smallMuted" style="font-size:11px;margin:4px 0 0;">Keyingi xaridda avtomatik ishlatiladi</p></div>` : '') +
        giftProgressHtml(currentUser.id) +
        myPromoHtml(currentUser.id) +
        referralHtml(currentUser.id);
    }catch(e){ console.warn('Profil bonuslari:', e); }
  };
})();
