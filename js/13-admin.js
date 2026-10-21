/* Unutilmas Ta'm — 13-admin
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function catName(id){ const c = (state.categories||[]).find(x=>x.id===id); return c ? c.name : "Boshqa"; }

/* ═══════════════════════════════════════════════════════════════
   IKKI XIL NARX: iste'molchi (chakana) va magazin egasi (ulgurji)
   ───────────────────────────────────────────────────────────────
   Mahsulotda ikkita narx bo'ladi:
     p.price       — iste'molchi narxi (chakana)
     p.priceStore  — magazin egasi narxi (ulgurji, arzonroq)
   Agar priceStore kiritilmagan bo'lsa, ikkalasi uchun p.price ishlatiladi.

   MUHIM: hech qayerda to'g'ridan-to'g'ri p.price yozilmasin —
   doim priceOf(p) chaqirilsin, aks holda narxlar chalkashadi.
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   MAGAZIN EGASI TASDIQLASH
   ───────────────────────────────────────────────────────────────
   Magazin egasi arzon (ulgurji) narxlarni ko'radi. Shuning uchun
   oddiy iste'molchi "magazin egasi" bo'lib ro'yxatdan o'tib,
   arzon narxda xarid qilishga urinishi mumkin edi.

   Endi: magazin egasi ro'yxatdan o'tgach hisobi KUTISH holatida
   turadi. Admin tasdiqlamaguncha mahsulotlar va narxlar
   ko'rinmaydi. Admin tasdiqlagach ilova to'liq ochiladi.

   u.storeStatus: 'pending' | 'approved' | 'rejected'
   ═══════════════════════════════════════════════════════════════ */

/* Foydalanuvchi yozuvini bazadan olish */
function currentUserRecord(){
  if(!currentUser || currentUser.role === 'admin') return null;
  return (state.users || []).find(x => x.id === currentUser.id) || null;
}

/* UMUMIY XAVFSIZLIK: ba'zi to'liq-ekranli qatlamlar (splash, onboarding va h.k.)
   noma'lum sabablarga ko'ra "yopiq" holatga o'tmasdan qolib ketishi mumkin edi va
   butun ekranni ko'rinmas holda bosishlardan to'sib qo'yardi. Endi har 2.5 soniyada
   avtomatik tekshirilib, shunday holat aniqlansa — darhol tuzatiladi. */
function __watchdogFixStuckOverlays(){
  ['splashScreen','onboardingBg'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const isMeantToBeHidden = id==='splashScreen' ? false : el.classList.contains('hidden');
    // splashScreen — agar 3 soniyadan ko'p vaqt o'tgan bo'lsa, har doim yo'q qilinishi kerak
    if(id==='splashScreen' && (Date.now() - __appStartTs > 3000)){
      if(el.parentNode) el.remove();
      return;
    }
    if(isMeantToBeHidden){
      el.style.pointerEvents = 'none';
    }
  });
}

function rerenderAfterCloud(){
  const sinceTouch = Date.now() - __lastTouchTs;
  const GUARD_MS = 1400; // avvalgi 650ms kamlik qildi — kengaytirildi
  if(sinceTouch < GUARD_MS){
    clearTimeout(__rerenderGuardTimer);
    __rerenderGuardTimer = setTimeout(rerenderAfterCloud, GUARD_MS - sinceTouch + 80);
    return;
  }
  try{
    normalizeState(); localSave();
    checkForNewNotifications();
    const active = document.querySelector('.view.active');
    if(active) renderView(active.id.replace('v-',''));
    // Chat oynasi ochiq bo'lsa — xabarlar Telegram kabi darhol yangilanadi
    const chatModal = document.getElementById('modalChat');
    if(chatModal && !chatModal.classList.contains('hidden')){ renderChatThread(); renderTypingIndicator(); }
    const trackModal = document.getElementById('modalLiveTracking');
    if(trackModal && !trackModal.classList.contains('hidden')) renderLiveTracking();
    if(typeof refreshNotifBadge==='function') try{ refreshNotifBadge(); }catch(e){}
    if(typeof applyHeroText==='function') try{ applyHeroText(); }catch(e){}
    /* Bulutdan yangi magazin egalari kelgan bo'lishi mumkin —
       ularni "Do'konlar" ro'yxati va xaritaga bog'laymiz.
       Kechiktirib chaqiriladi: bir necha hujjat ketma-ket kelsa,
       hammasi yetib bo'lgach bir marta ishlaydi. */
    if(typeof scheduleStoreOwnerSync === 'function') try{ scheduleStoreOwnerSync(1200); }catch(e){}
  }catch(e){}
}

/* ---------- Bulutga ulanish — ILOVANI KUTDIRMAYDI (fonda) ---------- */
function connectCloud(){
  if(!FIREBASE_CONFIG || !window.firebase) return;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);

    /* App Check — Firestore'dan OLDIN ishga tushirilishi shart */
    try{
      if(typeof APPCHECK_SITE_KEY === 'string' && APPCHECK_SITE_KEY &&
         firebase.appCheck){
        firebase.appCheck().activate(
          new firebase.appCheck.ReCaptchaV3Provider(APPCHECK_SITE_KEY),
          true    // tokenni avtomatik yangilab turadi
        );
        console.log('App Check yoqildi');
      }
    }catch(e){ console.warn('App Check ishga tushmadi:', e); }

    fsDb = firebase.firestore();
    try{
      fsDb.settings({
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,  // O'zbekiston tarmoqlarida osilishni tuzatadi
        useFetchStreams: false
      });
    }catch(e){}

    // Real vaqt: birinchi snapshot to'liq holatni ham olib keladi.
    // MUHIM: xavfsizlik qoidalari o'qishni faqat Firebase'ga kirganlarga
    // ruxsat beradi — shuning uchun avval kirish tayyor bo'lishini kutamiz.
    const __startListen = () => fsDb.collection('app').onSnapshot(s=>{
      // TIKLASH REJIMIDA: bulutdan kelayotgan (buzilgan/bo'sh) ma'lumot
      // mahalliy yaxshi nusxani ustiga yozib qo'ymasligi uchun, bu rejimda
      // kiruvchi ma'lumot UMUMAN qabul qilinmaydi — faqat YOZISH uchun ulanadi.
      if(inRestoreMode) return;
      let changed = false;
      s.docChanges().forEach(ch=>{
        if(ch.type === 'removed') return;
        const d = ch.doc.data() || {};
        /* Bo'laklangan katta bo'limlarni ham to'g'ri yig'adi */
        if(acceptCloudRaw(ch.doc.id, d)) changed = true;
      });
      // XAVFLI EDI VA OLIB TASHLANDI: avval "bulut bo'sh ko'rinsa, mahalliy
      // (bo'sh) nusxani ustiga yozib yuboramiz" degan mantiq bor edi — bu
      // internet uzilishi yoki yangi qurilmada ochilganda haqiqiy ma'lumotni
      // butunlay o'chirib yuborishi mumkin edi. Endi HECH QACHON avtomatik
      // ravishda "bo'sh" holat bulutga yozilmaydi — faqat kim bazani
      // BOSHQARADIGAN admin panelidan ANIQ o'zgartirish kiritsa, o'shanda yoziladi.
      if(changed && !fsApplying){
        fsApplying = true;
        try{ rerenderAfterCloud(); } finally { fsApplying = false; }
      }
    }, err=>console.warn('Firestore listen xatosi:', err && err.code || err));

    if(typeof whenFirebaseAuthReady === 'function') whenFirebaseAuthReady(__startListen);
    else __startListen();

    // Yuborilmagan o'zgarishlar bo'lsa — darhol jo'natishga urinamiz
    if(Object.keys(dirtyKeys).length) scheduleFlush(1500);
  }catch(e){
    console.warn('Firebase ulanmadi, lokal rejimda davom etamiz:', e);
    fsDb = null;
  }
}

async function loadState(){
  inRestoreMode = new URLSearchParams(location.search).get('restore') === '1';
  // 1) Lokal — ilova BIR ZUMDA ochiladi
  if(!localLoad()){ state = seedState(); normalizeState(); seedLocalHashes(); localSave(); }
  // 2) Bulut — fonda ulanadi, ochilishni kutdirmaydi
  connectCloud();
  // 3) Avvaldan saqlangan siqilmagan (juda katta) rasmlarni fonda avtomatik tuzatish
  setTimeout(migrateOversizedImages, 2500);
  /* 4) Magazin egalarini "Do'konlar" bo'limi va xarita bilan bog'laydi.
        MUHIM: bu endi FAQAT shu yerda emas — bulutdan ma'lumot kelganda
        ham qayta ishlaydi (rerenderAfterCloud ichida). Ilgari faqat shu
        bitta chaqiruv bor edi va u bulutdagi foydalanuvchilar kelishidan
        OLDIN ishlab tugardi — shuning uchun hech kim xaritaga chiqmasdi. */
  setTimeout(function(){ if(typeof syncStoreOwners === 'function') syncStoreOwners(); }, 3200);
}

function setRegType(t){
  regType = t;
  /* Iste'molchi/Magazin tugmalari endi faqat TANLOV oynasida — bu yerda yo'q */
  const a = document.getElementById('regTypeBtnCustomer');
  const b = document.getElementById('regTypeBtnStore');
  if(a) a.classList.toggle('active', t==='customer');
  if(b) b.classList.toggle('active', t==='store');
  document.getElementById('regStoreNameWrap').classList.toggle('hidden', t!=='store');
  document.getElementById('regStoreAddrWrap').classList.toggle('hidden', t!=='store');
  /* Sarlavha tanlangan turga qarab o'zgarsin */
  const ttl = document.getElementById('authTitle');
  if(ttl && authMode === 'register'){
    ttl.textContent = (t==='store') ? "Magazin egasi sifatida ro'yxatdan o'tish"
                                    : "Iste'molchi sifatida ro'yxatdan o'tish";
  }
}

function openForgotFlow(){
  document.getElementById('authMainFields').classList.add('hidden');
  document.getElementById('authForgotPane').classList.remove('hidden');
  document.getElementById('authTitle').textContent = 'Parolni tiklash';
  pendingReset = null;
  prClearMsg();
  prGoPhase(1);
  document.getElementById('forgotContact').value = document.getElementById('authContact').value.trim();
  const np = document.getElementById('forgotNewPass'), np2 = document.getElementById('forgotNewPass2'), pc = document.getElementById('prCode');
  if(np) np.value=''; if(np2) np2.value=''; if(pc) pc.value='';
}

function closeForgotFlow(){
  document.getElementById('authForgotPane').classList.add('hidden');
  document.getElementById('authMainFields').classList.remove('hidden');
  document.getElementById('authTitle').textContent = 'Kirish';
  pendingReset = null;
  prClearMsg();
}

function getAppLogo(){
  if(!APP_LOGO_B64){
    const el = document.querySelector('.splashLogoFull');
    if(el && el.src) APP_LOGO_B64 = el.src;
  }
  return APP_LOGO_B64 || './apple-touch-icon.png';
}

/* ============================================================
   YANGI FOYDALANUVCHIGA ISHLAB CHIQARUVCHIDAN XUSH KELIBSIZ XABARI
   ============================================================ */
async function sendWelcomeMessage(userId, userName){
  try{
    const firstName = (userName||'').trim().split(' ')[0] || '';
    const body = `Assalomu alaykum${firstName?', '+firstName:''}! 🎉 «Unutilmas Ta'm» oilasiga xush kelibsiz!\n\nEndi bizning barcha mazali taomlarimizni ko'rib, bir necha bosishda buyurtma berishingiz mumkin. Savol yoki takliflaringiz bo'lsa — "Chat" bo'limi orqali to'g'ridan-to'g'ri biz bilan bog'laning.\n\nIshtahangiz ochiq bo'lsin! 🍽️`;
    state.notifications.push({id:uid('n'), recipient:userId, title:"Xush kelibsiz! 👋", body, type:'welcome', ref:null, date:new Date().toISOString(), read:false});
    await saveState();
  }catch(e){}
}

function topRightAction(){
  if(currentUser){ openProfileModal(); }
  else { openAuthModal('login', null); }
}

/* ==================== ADMIN: USERS MANAGEMENT ==================== */
function openUsersModal(){
  const box = document.getElementById('usersList');
  const storeUsers = state.users.filter(u=>u.userType==='store');
  const custUsers = state.users.filter(u=>u.userType!=='store');
  const userCardHtml = u=>{
    const orderCount = state.orders.filter(o=>o.userId===u.id).length;
    const subMeta = u.userType==='store'
      ? `${u.storeName||''} · ${u.address||''} · ${u.contact}`
      : `${u.contact} · ${orderCount} ta buyurtma`;
    const avatar = u.photo ? `<img src="${u.photo}">` : ic('user',16);
    const st = u.userType==='store' ? (u.storeStatus||'approved') : null;
    const stBadge = st==='pending'  ? '<span class="badge amber" style="font-size:10px;padding:1px 6px;">Tasdiq kutilmoqda</span>'
                  : st==='rejected' ? '<span class="badge red" style="font-size:10px;padding:1px 6px;">Rad etilgan</span>'
                  : st==='approved' ? '<span class="badge green" style="font-size:10px;padding:1px 6px;">Tasdiqlangan</span>' : '';
    const stActions = st==='pending' ? `
        <div class="storeApproveRow">
          <button class="primaryBtn" style="flex:1;padding:9px;font-size:12.5px;" onclick="approveStoreUser('${u.id}')">✓ Tasdiqlash</button>
          <button class="ghostBtn" style="flex:1;padding:9px;font-size:12.5px;color:#EF4B62;" onclick="rejectStoreUser('${u.id}')">✕ Rad etish</button>
        </div>` : (st==='rejected' ? `
        <div class="storeApproveRow">
          <button class="ghostBtn" style="width:100%;padding:9px;font-size:12.5px;" onclick="resetStoreUser('${u.id}')">Qayta ko'rib chiqish</button>
        </div>` : '');
    return `<div class="card" style="${u.blocked?'opacity:.6;border-color:var(--danger);':''}${st==='pending'?'border-color:#F0A24B;background:#FFFDF8;':''}">
      <div class="row">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div class="avatarSm">${avatar}</div>
          <div style="min-width:0;">
            <div class="title">${u.name} ${stBadge} ${u.verified?`<span class="verifiedTick" title="Tasdiqlangan">${ic('shieldCheck',13)}</span>`:''} ${u.blocked?'<span class="badge red" style="font-size:10px;padding:1px 6px;">Bloklangan</span>':''}</div>
            <div class="meta">${subMeta}</div>
            <div class="meta smallMuted">${u.personalId?('ID: '+u.personalId+' · '):''}IP: ${u.ipAddress||'aniqlanmagan'}</div>
            ${typeof u.homeLat==='number'?`<div class="meta" style="color:#7C4DD8;font-weight:700;display:flex;align-items:center;gap:4px;">${ic('pin',11)} Ro'yxatda joylashuv belgilagan</div>`:''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          ${typeof u.homeLat==='number'?`<button class="tinyIconBtn" style="background:#F0E9FC;" title="Xaritada ko'rish" onclick="showUserOnMap('${u.id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C4DD8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></button>`:''}
          <button class="tinyIconBtn" title="${u.blocked?'Blokdan chiqarish':'Bloklash'}" onclick="toggleBlockUser('${u.id}')">${ic(u.blocked?'shieldCheck':'block',15)}</button>
          <button class="tinyIconBtn danger" onclick="deleteUser('${u.id}')">${ic('trash',15)}</button>
        </div>
      </div>
      ${stActions}
    </div>`;
  };
  box.innerHTML = `
    <div class="sectionHead" style="margin-top:0;"><h2>Magazin egalari</h2><span class="badge blue">${storeUsers.length}</span>${
      storeUsers.filter(u=>(u.storeStatus||'approved')==='pending').length
        ? `<span class="badge amber">${storeUsers.filter(u=>(u.storeStatus||'approved')==='pending').length} ta kutmoqda</span>` : ''}</div>
    ${storeUsers.map(userCardHtml).join('') || emptyHtml('store','Hali magazin egasi ro\'yxatdan o\'tmagan')}
    <div class="sectionHead"><h2>Iste'molchilar</h2><span class="badge gray">${custUsers.length}</span></div>
    ${custUsers.map(userCardHtml).join('') || emptyHtml('users','Hali iste\'molchi ro\'yxatdan o\'tmagan')}
  `;
  openModal('modalUsers');
}

async function toggleBlockUser(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u) return;
  u.blocked = !u.blocked;
  await saveState();
  openUsersModal();
  if(u.blocked){
    pushNotification(u.id, 'Hisobingiz bloklandi', 'Administratsiya tomonidan hisobingiz vaqtincha bloklandi. Savollar bo\'lsa, do\'kon bilan bog\'laning.', 'block');
  }
}

async function deleteUser(userId){
  if(!confirm('Bu foydalanuvchi va uning barcha tarixi (buyurtmalar) o\'chiriladi. Davom etasizmi?')) return;
  state.users = state.users.filter(x=>x.id!==userId);
  state.orders = state.orders.filter(o=>o.userId!==userId);
  state.ledger = state.ledger.filter(l=>!(l.partyType==='customer' && l.partyId===userId));
  await saveState();
  openUsersModal();
  renderDash();
}

/* ==================== SELLER SETTINGS (admin) ==================== */
function openSellerSettings(){
  const si = state.sellerInfo;
  document.getElementById('siTelegram').value = si.telegram||'';
  document.getElementById('siInstagram').value = si.instagram||'';
  document.getElementById('siChannel').value = si.channel||'';
  document.getElementById('siYoutube').value = si.youtube||'';
  document.getElementById('siPhone').value = si.phone||'';
  document.getElementById('siAddress').value = si.address||'';
  document.getElementById('siAbout').value = si.about||'';
  document.getElementById('siInstallUrl').value = si.installUrl||'';
  document.getElementById('siApkUrl').value = si.apkUrl||'';
  document.getElementById('siAndroidBtnShow').value = si.androidBtnHide ? '0' : '1';
  document.getElementById('siHeroEyebrow').value = si.heroEyebrow||'';
  document.getElementById('siHeroTitle').value = si.heroTitle||'';
  document.getElementById('siDevBtnShow').value = si.devBtnHide ? '0' : '1';
  document.getElementById('siDevBtnText').value = si.devBtnText||'';
  openModal('modalSellerSettings');
}

async function saveSellerInfo(){
  state.sellerInfo = {
    telegram: document.getElementById('siTelegram').value.trim(),
    instagram: document.getElementById('siInstagram').value.trim(),
    channel: document.getElementById('siChannel').value.trim(),
    youtube: document.getElementById('siYoutube').value.trim(),
    phone: document.getElementById('siPhone').value.trim(),
    address: document.getElementById('siAddress').value.trim(),
    about: document.getElementById('siAbout').value.trim(),
    installUrl: document.getElementById('siInstallUrl').value.trim(),
    apkUrl: document.getElementById('siApkUrl').value.trim(),
    androidBtnHide: document.getElementById('siAndroidBtnShow').value === '0',
    heroEyebrow: document.getElementById('siHeroEyebrow').value.trim(),
    heroTitle: document.getElementById('siHeroTitle').value.trim(),
    devBtnHide: document.getElementById('siDevBtnShow').value === '0',
    devBtnText: document.getElementById('siDevBtnText').value.trim(),
  };
  await saveState();
  closeModal('modalSellerSettings');
  renderFooter();
}

/* ==================== ANDROID'GA O'RNATISH ==================== */
function openAndroidModal(){
  const url = (state.sellerInfo && state.sellerInfo.apkUrl) || '';
  if(!url) return;
  document.getElementById('androidDownloadBtn').href = url;
  document.getElementById('androidUrlTx').textContent = url.replace(/^https?:\/\//,'');
  openModal('modalAndroid');
}

function openDevCard(){
  /* Dasturchi kartasi alohida faylda — faqat kerak bo'lganda yuklanadi */
  const fr = document.getElementById('devCardFrame');
  openModal('modalDevCard');
  if(fr && !fr.dataset.loaded){
    fetch('assets/dev-card.html?v=145')
      .then(r => r.text())
      .then(html => { fr.srcdoc = html; fr.dataset.loaded = '1'; })
      .catch(e => console.warn('Dasturchi kartasi yuklanmadi:', e));
  }
}

function openInstallModal(){
  const url = (state.sellerInfo && state.sellerInfo.installUrl) || '';
  if(!url) return;
  document.getElementById('installOpenBtn').href = url;
  document.getElementById('installUrlTx').textContent = url.replace(/^https?:\/\//,'');
  openModal('modalInstall');
}

function currentRoleKey(){ return currentUser ? currentUser.role : 'guest'; }

function goHome(){
  showView((currentUser && currentUser.role==='admin') ? 'dash' : 'catalog');
}

function setAppLanguage(lang){
  appLang = lang;
  try{ localStorage.setItem('utam_lang', lang); }catch(e){}
  refreshLangUI();
  startTranslateObserver();
  const active = document.querySelector('.view.active');
  if(active) { try{ renderView(active.id.replace('v-','')); }catch(e){} }
  applyTranslations();
}

function applyTranslations(){
  try{ buildNav(); }catch(e){}
  try{ refreshShell(); }catch(e){}
  translateDOM(document.body, appLang==='ru' ? TR_RU : TR_UZ);
}

function startTranslateObserver(){
  if(__translateObserverStarted) return;
  __translateObserverStarted = true;
  const obs = new MutationObserver(muts=>{
    if(appLang !== 'ru') return; // faqat ruscha rejimida yangi render'larni avtomatik tarjima qilamiz
    muts.forEach(m=>{
      m.addedNodes.forEach(node=>{
        if(node.nodeType === 1) translateDOM(node, TR_RU);
        else if(node.nodeType === 3){
          const t = TR_RU[node.nodeValue.trim()];
          if(t) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), t);
        }
      });
    });
  });
  obs.observe(document.body, {childList:true, subtree:true, characterData:true});
}

function todaysRevenue(){
  const today = todayISO();
  return state.sales.filter(s=>new Date(s.ts).toISOString().slice(0,10)===today).reduce((s,x)=>s+(x.total!=null?x.total:(x.price||0)), 0);
}

/* O'tgan (to'liq tugagan) oyning umumiy savdosi — joriy oy hisobga
   olinmaydi, aynan oldingi taqvim oyi. */
function previousMonthInfo(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(); // m: joriy oy, 0-asosli
  const prevM = m===0 ? 11 : m-1;
  const prevY = m===0 ? y-1 : y;
  return {year: prevY, month: prevM};
}
function previousMonthRevenue(){
  const {year, month} = previousMonthInfo();
  return (state.sales||[]).filter(function(s){
    const d = new Date(s.ts);
    return d.getFullYear()===year && d.getMonth()===month;
  }).reduce(function(sum,x){ return sum + (x.total!=null?x.total:(x.price||0)); }, 0);
}
const PREV_MONTH_NAMES = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

function renderDash(){
  refreshPendingStoreBadge();
  try{ if(typeof renderDashCharts === 'function') setTimeout(renderDashCharts, 0); }catch(e){}
  document.getElementById('statProducts').textContent = state.products.length;
  document.getElementById('statStock').textContent = fmt(state.products.reduce((s,p)=>s+p.stock,0));
  /* Bosh sahifadagi karta endi QAYTARILGAN mahsulotlarni ko'rsatadi */
  const _ret = (typeof returnsSummary === 'function') ? returnsSummary() : {totalQty:0, totalLoss:0};
  const _rEl = document.getElementById('statReturns');
  if(_rEl) _rEl.textContent = _ret.totalQty + ' dona';
  document.getElementById('statOrders').textContent = state.orders.filter(o=>o.status==='yangi').length;
  document.getElementById('statUsers').textContent = state.users.length;
  document.getElementById('statRevenueToday').textContent = fmt(todaysRevenue());

  const today = todayISO();
  const dueNow = state.ledger.filter(l=>l.debt>0 && l.due && l.due<=today);
  const banner = document.getElementById('dashNotify');
  banner.innerHTML = dueNow.length ? `<div class="notifyBanner">${ic('alert',18)}<div>${dueNow.length} ta qarz muddati yetdi yoki o'tib ketdi. "Do'konlar" bo'limini tekshiring.</div></div>` : '';

  const ordersBox = document.getElementById('dashOrders');
  const recentOrders = [...state.orders].reverse().slice(0,4);
  ordersBox.innerHTML = recentOrders.length ? recentOrders.map(orderCardHtml).join('') : emptyHtml('receipt','Hali buyurtma yo\'q');

  const debtsBox = document.getElementById('dashDebts');
  const soonDebts = state.ledger.filter(l=>l.debt>0 && isDebtDueSoon(l)).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,6);
  debtsBox.innerHTML = soonDebts.length ? soonDebts.map(debtRowHtml).join('') : emptyHtml('check','Muddati yaqinlashgan qarz yo\'q');
}

function updateUnitFieldLabel(){
  const unitType = document.getElementById('npUnitType').value || 'gram';
  document.getElementById('npGramLabel').textContent = UNIT_FIELD_LABELS[unitType];
}

function setScanMode(mode){
  scanMode = mode;
  document.getElementById('modeBtnIn').classList.toggle('active', mode==='in');
  document.getElementById('modeBtnOut').classList.toggle('active', mode==='out');
  sessionQty=0; sessionRevenue=0; sessionItems={};
  renderScanSession();
}

function scanBeep(){
  try{
    if(navigator.vibrate) navigator.vibrate(60);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const actx = new Ctx();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.value = 1500;
    gain.gain.setValueAtTime(0.18, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.14);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime + 0.14);
  }catch(e){}
}

async function startScanner(){
  const video = document.getElementById('video');
  document.getElementById('scanResultBox').innerHTML = `<div class="scanResult">${ic('check',16)}Kamera ochilmoqda...</div>`;
  try{
    // Real skanerlardagidek: yuqori aniqlik + avtofokus, orqa kamera
    const constraints = {
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1280}, height:{ideal:720},
        advanced:[{focusMode:'continuous'}]
      }
    };
    let stream;
    try{ stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch(e){ stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); }
    scanStream = stream;
    scanTrack = stream.getVideoTracks()[0];
    video.srcObject = scanStream;
    await video.play();
    // Iloji bo'lsa qurilmaning tabiiy (native) barkod skaneridan foydalanamiz — tezroq va aniqroq
    if('BarcodeDetector' in window){
      try{ nativeDetector = new BarcodeDetector({formats:['qr_code']}); }
      catch(e){ nativeDetector = null; }
    } else {
      nativeDetector = null;
    }
    if(!scanCanvas){ scanCanvas = document.createElement('canvas'); scanCtx = scanCanvas.getContext('2d', {willReadFrequently:true}); }
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult">${ic('check',16)}Kamera tayyor — QR kodni ramka ichiga tuting.</div>`;
    scanLoopTick();
  }catch(e){
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult err">${ic('alert',16)}Kameraga ruxsat berilmadi yoki topilmadi.</div>`;
  }
}

function stopScanner(){
  if(scanLoopId) cancelAnimationFrame(scanLoopId);
  if(scanLoopTimer) clearTimeout(scanLoopTimer);
  scanLoopId = null; scanLoopTimer = null;
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
  scanTrack = null;
  const video = document.getElementById('video');
  if(video) video.srcObject = null;
}

function maybeHandleScan(text){
  if(!text) return;
  const now = Date.now();
  if(text === lastScanText && now - lastScanTime < 1800) return; // bir xil kodni ketma-ket qayta o'qimaslik
  lastScanTime = now; lastScanText = text;
  scanBeep();
  handleScannedCode(text);
}

async function handleScannedCode(text){
  if(!text.startsWith('UTAM:')){
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult err">${ic('alert',16)}Bu QR kod tanilmadi.</div>`;
    return;
  }
  const productId = text.split(':')[1];
  const p = state.products.find(x=>x.id===productId);
  if(!p){
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult err">${ic('alert',16)}Mahsulot topilmadi.</div>`;
    return;
  }
  if(scanMode==='in'){
    p.stock += 1;
    await saveState();
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult">${ic('check',16)}${p.name} +1 (omborda: ${p.stock})</div>`;
    renderProducts();
  } else {
    if(p.stock<=0){
      document.getElementById('scanResultBox').innerHTML = `<div class="scanResult err">${ic('alert',16)}${p.name} omborda qolmagan!</div>`;
      return;
    }
    p.stock -= 1;
    state.sales.push({id:uid('sl'), productId:p.id, productName:p.name, gram:p.gram, price:p.price, qty:1, total:p.price, ts: nowTs(), cost: p.cost != null ? Number(p.cost) : null});
    await saveState();
    sessionQty += 1; sessionRevenue += p.price;
    sessionItems[productId] = (sessionItems[productId]||0)+1;
    document.getElementById('scanResultBox').innerHTML = `<div class="scanResult">${ic('check',16)}${p.name} sotildi (jami: ${sessionItems[productId]} dona)</div>`;
    renderScanSession();
    renderProducts();
  }
}

/* ---- Eng ko'p sotilgan mahsulotlar (top 5) ---- */
function renderBestSellers(rows){
  const box = document.getElementById('bestSellersList');
  if(!box) return;
  const top = [...rows].sort((a,b)=>b.qty-a.qty).slice(0,5);
  box.innerHTML = top.map((r,i)=>`
    <div class="sessionRow">
      <span><b>#${i+1}</b> ${r.name}</span>
      <b>${r.qty} dona</b>
    </div>
  `).join('') || emptyHtml('chart',"Hali sotuv yo'q");
}

/* ---- VIP mijozlar (eng ko'p xarid qilganlar, top 5) ---- */
function renderVipCustomers(){
  const box = document.getElementById('vipCustomersList');
  if(!box) return;
  const byUser = {};
  state.orders.forEach(o=>{
    if(!o.userId || o.userId==='admin') return;
    if(!byUser[o.userId]) byUser[o.userId] = {name:o.customerName, total:0, count:0};
    byUser[o.userId].total += o.total||0;
    byUser[o.userId].count += 1;
  });
  const top = Object.values(byUser).sort((a,b)=>b.total-a.total).slice(0,5);
  box.innerHTML = top.map((u,i)=>`
    <div class="sessionRow">
      <span><b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</b> ${u.name} <span class="smallMuted">(${u.count} buyurtma)</span></span>
      <b>${fmt(u.total)} so'm</b>
    </div>
  `).join('') || emptyHtml('users',"Hali mijoz yo'q");
}

/* ---- Ketib qolgan mijozlarni qaytarish ---- */
function renderWinback(){
  const box = document.getElementById('winbackList');
  if(!box) return;
  const cutoff = nowTs() - 14*86400000;
  const lastOrderByUser = {};
  state.orders.forEach(o=>{
    if(!o.userId || o.userId==='admin') return;
    const ts = new Date(o.date).getTime();
    if(!lastOrderByUser[o.userId] || ts>lastOrderByUser[o.userId]) lastOrderByUser[o.userId] = ts;
  });
  const inactive = Object.entries(lastOrderByUser)
    .filter(([uid,ts])=>ts < cutoff)
    .map(([uid,ts])=>({user: state.users.find(u=>u.id===uid), lastTs: ts}))
    .filter(x=>x.user);
  box.innerHTML = inactive.map(x=>`
    <div class="sessionRow">
      <span><b>${x.user.name}</b> <span class="smallMuted">(oxirgi buyurtma: ${new Date(x.lastTs).toLocaleDateString('uz-UZ')})</span></span>
      <button class="ghostBtn" style="padding:6px 10px;font-size:11.5px;" onclick="sendWinbackReminder('${x.user.id}')">Eslatma yuborish</button>
    </div>
  `).join('') || emptyHtml('users',"Hozircha ketib qolgan mijoz yo'q 🎉");
}

async function sendWinbackReminder(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u) return;
  await pushNotification(userId, "Sizni sog'indik! 🍽",
    `${u.name}, ko'pdan beri buyurtma bermadingiz. Bizning yangi mazali taomlarimizni sinab ko'ring!`, 'winback');
  alert(`${u.name} ga eslatma yuborildi`);
}

/* ---- Ombor bashorati: sotuv tezligiga qarab necha kunga yetishini hisoblaydi ---- */
function renderStockForecast(){
  const box = document.getElementById('stockForecastList');
  if(!box) return;
  const cutoff = nowTs() - 14*86400000;
  const salesRecent = state.sales.filter(s=>s.ts>=cutoff);
  const byProduct = {};
  salesRecent.forEach(s=>{
    if(!byProduct[s.productId]) byProduct[s.productId] = 0;
    byProduct[s.productId] += 1;
  });
  const forecasts = [];
  state.products.forEach(p=>{
    const soldCount = byProduct[p.id] || 0;
    if(soldCount === 0) return; // sotuv bo'lmagan mahsulotni bashorat qilib bo'lmaydi
    const dailyRate = soldCount / 14;
    const daysLeft = dailyRate > 0 ? (p.stock||0) / dailyRate : Infinity;
    if(daysLeft < 5){
      forecasts.push({name: p.name, daysLeft, stock: p.stock||0});
    }
  });
  forecasts.sort((a,b)=>a.daysLeft-b.daysLeft);
  box.innerHTML = forecasts.map(f=>`
    <div class="sessionRow">
      <span><b>${f.name}</b> <span class="smallMuted">(${f.stock} dona qoldi)</span></span>
      <b style="color:${f.daysLeft<2?'var(--danger)':'var(--amber)'};">≈ ${f.daysLeft.toFixed(1)} kunga yetadi</b>
    </div>
  `).join('') || emptyHtml('box',"Hozircha tez tugaydigan mahsulot yo'q 👍");
}

async function useMyLocation(){
  if(!navigator.geolocation){ alert('Geolokatsiya qo\'llab-quvvatlanmaydi'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    document.getElementById('nsLat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('nsLng').value = pos.coords.longitude.toFixed(6);
  }, ()=>alert('Joylashuvni olib bo\'lmadi'));
}

function itemChipsHtml(items, opts={}){
  if(!items || !items.length) return '';
  return `<div class="itemChips">` + items.map((i,idx)=>{
    const [bg,fg] = CHIP_TINTS[idx % CHIP_TINTS.length];
    const line = (typeof i.price === 'number') ? i.price * i.qty : null;
    const prod = i.productId ? (state.products||[]).find(p=>p.id===i.productId) : null;
    const thumb = prod && prod.image ? `<img class="icThumb" src="${prod.image}">` : `<span class="icThumb icThumbBlank">${ic('box',11)}</span>`;
    return `<span class="itemChip" style="background:${bg};color:${fg};">${thumb}${i.name}${(opts.gram && i.gram)?` <span class="icGram">${i.gram}${UNIT_LABELS[i.unitType||'gram']}</span>`:''}<span class="icQty">×${i.qty}</span>${line!=null?`<span class="icPrice">${fmt(line)} so'm</span>`:''}</span>`;
  }).join('') + `</div>`;
}

function moneyPillsHtml(l, opts={}){
  const overdue = opts.overdue;
  return `<div class="moneyPills">
    <div class="moneyPill neutral"><div class="v">${fmt(l.total)}</div><div class="k">Jami so'm</div></div>
    <div class="moneyPill green"><div class="v">${fmt(l.paid)}</div><div class="k">To'landi</div></div>
    <div class="moneyPill ${l.debt>0?('red'+(overdue?' alert':'')):'green'}"><div class="v">${fmt(l.debt)}</div><div class="k">${l.debt>0?'Qarz':'Qarz yo\'q'}</div></div>
  </div>`;
}

function initialsOf(name){
  const parts=(name||'?').trim().split(/\s+/);
  return ((parts[0]||'')[0]||'?').toUpperCase() + ((parts[1]||'')[0]||'').toUpperCase();
}

function openPay(type,id,name){
  payTarget = {type,id};
  document.getElementById('payWho').textContent = name;
  document.getElementById('payAmount').value = '';
  openModal('modalPay');                 // magazin oynasi ostida qoladi
}

async function confirmPay(){
  let amount = parseFloat(document.getElementById('payAmount').value)||0;
  const rows = state.ledger.filter(l=>l.partyType===payTarget.type && l.partyId===payTarget.id && l.debt>0)
    .sort((a,b)=>a.date.localeCompare(b.date));
  for(const l of rows){
    if(amount<=0) break;
    const pay = Math.min(amount, l.debt);
    l.paid += pay; l.debt -= pay; amount -= pay;
    if(l.debt<=0) l.status='paid';
  }
  await saveState();
  closeModal('modalPay');
  renderDebtsAdmin(); renderStores(); renderDash();
  if(typeof refreshStoreDetailIfOpen === 'function') refreshStoreDetailIfOpen();
}

function etaBlockHtml(o){
  if(o.status==='yetkazildi' || !o.etaMinutes || !o.etaSetAt) return '';
  const targetTs = o.etaSetAt + o.etaMinutes*60000;
  const remainMin = Math.round((targetTs - Date.now())/60000);
  const text = remainMin > 0 ? `≈ ${remainMin} daqiqada yetadi` : "Yetkazish vaqti yaqinlashdi";
  return `<div class="meta" style="color:var(--forest-dark);font-weight:700;margin-top:6px;">⏱ ${text}</div>`;
}

function renderLiveTracking(){
  const o = state.orders.find(x=>x.id===liveTrackOrderId);
  if(!o || !liveTrackMap) return;
  const hasDest = typeof o.lat==='number' && typeof o.lng==='number';
  const hasCourier = typeof o.courierLat==='number' && typeof o.courierLng==='number';

  if(hasCourier){
    if(!liveTrackCourierMarker){
      liveTrackCourierMarker = L.marker([o.courierLat,o.courierLng], {icon: L.divIcon({className:'', html:'<div style="width:18px;height:18px;border-radius:50%;background:#2FA968;border:3px solid #fff;box-shadow:0 0 0 4px rgba(47,169,104,.3);"></div>'})}).addTo(liveTrackMap);
    } else {
      liveTrackCourierMarker.setLatLng([o.courierLat,o.courierLng]);
    }
  }
  if(hasDest && !liveTrackDestMarker){
    liveTrackDestMarker = L.marker([o.lat,o.lng], {icon: L.divIcon({className:'', html:'<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#EA5A1F;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>'})}).addTo(liveTrackMap);
  }
  if(hasCourier && hasDest){
    const coords = [[o.courierLat,o.courierLng],[o.lat,o.lng]];
    if(!liveTrackLine){
      liveTrackLine = L.polyline(coords, {color:'#1C1712', weight:4, opacity:0.75, dashArray:'6,8'}).addTo(liveTrackMap);
    } else {
      liveTrackLine.setLatLngs(coords);
    }
  }
  const staleMs = o.courierUpdatedAt ? Date.now()-o.courierUpdatedAt : Infinity;
  document.getElementById('liveTrackStatus').textContent = staleMs<15000 ? "🟢 Jonli kuzatuv" : (staleMs<90000 ? "🟡 Yangilanmoqda..." : "⚪ Aloqa uzilgan bo'lishi mumkin");
}

function closeLiveTracking(){
  clearInterval(liveTrackInterval); liveTrackInterval = null;
  closeModal('modalLiveTracking');
}

function setDlBtnLoading(btn, loading, loadingText){
  if(!btn) return;
  if(loading){
    btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = '⏳ ' + loadingText;
    btn.disabled = true;
    btn.style.opacity = '.65';
  } else {
    if(btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
    btn.disabled = false;
    btn.style.opacity = '';
  }
}

function pdUpdateTotal(){
  if(!pdCurrentProduct) return;
  document.getElementById('pdTotalSum').textContent = fmt(pdCurrentProduct.price * pdQty) + " so'm";
}

function pdChangeQty(d){
  const min = (pdCurrentProduct && pdCurrentProduct.preorder)
    ? Math.max(1, Number(pdCurrentProduct.minOrder) || 1) : 1;
  const next = pdQty + d;
  if(next < min){
    pdQty = min;
    document.getElementById('pdQty').value = pdQty;
    pdUpdateTotal();
    alert("Bu mahsulot buyurtma asosida tayyorlanadi.\n\nEng kam buyurtma: " + min + " dona.");
    return;
  }
  pdQty = Math.max(1, next);
  document.getElementById('pdQty').value = pdQty;
  pdUpdateTotal();
}

/* Miqdor raqamiga to'g'ridan-to'g'ri qo'lda son yozish (masalan 10 marta + bosish o'rniga "10" deb yozish) */
function pdQtyInput(el){
  const n = parseInt(el.value.replace(/[^0-9]/g,''), 10);
  if(!isNaN(n) && n>0){ pdQty = n; pdUpdateTotal(); }
}

function pdQtyBlur(el){
  let n = parseInt(el.value.replace(/[^0-9]/g,''), 10);
  if(isNaN(n) || n<1) n = 1;
  const min = (pdCurrentProduct && pdCurrentProduct.preorder)
    ? Math.max(1, Number(pdCurrentProduct.minOrder) || 1) : 1;
  if(n < min){
    n = min;
    alert("Eng kam buyurtma: " + min + " dona.");
  }
  pdQty = n; el.value = n;
  pdUpdateTotal();
}

function pdBuyNow(){
  if(previewBlocked()) return;
  if(!pdCurrentProduct) return;
  if(pdCurrentProduct.preorder){
    const chk = preorderCheck(pdCurrentProduct, pdQty);
    if(!chk.ok){ alert(chk.msg); return; }
  }else if(pdCurrentProduct.stock<=0){ return; }
  basket[pdCurrentProduct.id] = (basket[pdCurrentProduct.id]||0) + pdQty;
  updateBasketCount();
  closeModal('modalProductDetail');
  renderBasketModal();
  openModal('modalBasket');
}

function eoChangeQty(idx,d){
  editingOrderItems[idx].qty = Math.max(1, editingOrderItems[idx].qty+d);
  renderEditOrderModal();
}

function eoRemoveItem(idx){
  editingOrderItems.splice(idx,1);
  renderEditOrderModal();
}

function fillUpdateTemplate(){
  document.getElementById('bcTitle').value = "ILOVA YANGILANDI";
  if(!document.getElementById('bcBody').value.trim()){
    document.getElementById('bcBody').value = "Ilovamizga yangi imkoniyatlar qo'shildi va xatolar tuzatildi. Yangi versiyani yuklab, yangiliklarni his qiling!";
  }
  const apkUrl = (state.sellerInfo && state.sellerInfo.apkUrl) || '';
  if(apkUrl) document.getElementById('bcIncludeDownload').checked = true;
}

function togglePuSelect(pid){
  if(puSelected.has(pid)) puSelected.delete(pid); else puSelected.add(pid);
  renderProductUpdateList();
}

function startEditMessage(idx){
  const chat = state.chats.find(x=>x.userId===activeChatUserId);
  if(!chat || !chat.messages[idx]) return;
  editingMsgIndex = idx;
  const input = document.getElementById('chatInput');
  input.value = chat.messages[idx].text || '';
  autoGrowChatInput(input);
  input.focus();
  document.getElementById('chatEditBanner').classList.remove('hidden');
}

function cancelEditMessage(){
  editingMsgIndex = null;
  document.getElementById('chatInput').value = '';
  document.getElementById('chatEditBanner').classList.add('hidden');
}

function startRingtone(){
  stopRingtone();
  playNotifSound();
  callRingtoneInt = setInterval(playNotifSound, 1800);
}

function stopRingtone(){
  clearInterval(callRingtoneInt); callRingtoneInt = null;
}

function usePersonalCurrentLocation(){
  if(!navigator.geolocation){ alert('Geolokatsiya qo\'llab-quvvatlanmaydi'); return; }
  document.getElementById('boPersonalLocStatus').textContent = 'Joylashuv aniqlanmoqda...';
  navigator.geolocation.getCurrentPosition(pos=>{
    orderLat = pos.coords.latitude; orderLng = pos.coords.longitude;
    document.getElementById('boPersonalLocStatus').innerHTML = `${ic('check',13)} Joriy joylashuv qabul qilindi`;
  }, ()=>{ document.getElementById('boPersonalLocStatus').textContent = 'Joylashuvni olib bo\'lmadi'; });
}

function useSavedHomeLocation(){
  const u = currentUser ? state.users.find(x=>x.id===currentUser.id) : null;
  if(!u || !u.homeLat){ return; }
  orderLat = u.homeLat; orderLng = u.homeLng;
  document.getElementById('boPersonalLocStatus').innerHTML = `${ic('check',13)} Saqlangan uy manzili ishlatildi`;
}

function setScheduleMode(mode){
  scheduleMode = mode;
  document.getElementById('scheduleBtnNow').classList.toggle('active', mode==='now');
  document.getElementById('scheduleBtnLater').classList.toggle('active', mode==='later');
  document.getElementById('boScheduledTime').classList.toggle('hidden', mode==='now');
  if(mode==='later'){
    const inp = document.getElementById('boScheduledTime');
    if(!inp.value){
      const d = new Date(Date.now() + 60*60*1000); // 1 soatdan keyin, boshlang'ich taklif
      inp.value = d.toISOString().slice(0,16);
    }
  }
}

/* ==================== CUSTOMER: CABINET ==================== */
function renderCabinet(){
  const isUser = currentUser && currentUser.role==='user';
  document.getElementById('cabinetGuest').classList.toggle('hidden', isUser);
  document.getElementById('cabinetLoggedIn').classList.toggle('hidden', !isUser);
  if(!isUser){
    document.getElementById('cabinetGuest').innerHTML = `
      ${emptyHtml('user','Sizda hali shaxsiy kabinet yo\'q')}
      <p class="smallMuted" style="text-align:center;margin-top:-10px;margin-bottom:14px;">Ro'yxatdan o'tib, buyurtmalaringiz va qarzlaringizni shu yerda kuzatib boring.</p>
      <button class="primaryBtn" onclick="openAuthModal('register', null)">Ro'yxatdan o'tish / Kirish</button>
    `;
    return;
  }
  const myOrders = state.orders.filter(o=>o.userId===currentUser.id).reverse();
  const dokonOrderStoreIds = [...new Set(myOrders.filter(o=>o.storeId).map(o=>o.storeId))];
  const linkedDebts = state.ledger.filter(l=>l.partyType==='store' && dokonOrderStoreIds.includes(l.partyId));
  const debt = linkedDebts.reduce((s,l)=>s+l.debt,0);
  document.getElementById('custMyDebt').textContent = fmt(debt);
  document.getElementById('custMyOrders').textContent = myOrders.length;
  const myU = state.users.find(x=>x.id===currentUser.id);
  const avatar = myU && myU.photo ? `<img src="${myU.photo}">` : ic('user',20);
  const verifiedBadge = myU && myU.verified ? `<span class="verifiedTick" title="Tasdiqlangan">${ic('shieldCheck',13)}</span>` : '';
  document.getElementById('custProfileCard').innerHTML = `
    <div class="row">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatarPreview" style="width:44px;height:44px;">${avatar}</div>
        <div class="title">${currentUser.name} ${verifiedBadge}</div>
      </div>
      <span class="badge gray">Shaxsiy kabinet</span>
    </div>
    ${(currentUser.contact || (myU && myU.contact))
        ? `<div class="meta">${ic('phone',12)} ${currentUser.contact || myU.contact}</div>` : ''}
    ${myU && myU.personalId ? `<div class="meta">${ic('user',12)} Shaxsiy ID: <b>${myU.personalId}</b></div>` : ''}
  `;
  document.getElementById('custOrdersList').innerHTML = myOrders.map(orderCardHtmlSimple).join('') || emptyHtml('receipt','Hali buyurtma yo\'q');
  document.getElementById('custDebtList').innerHTML = linkedDebts.map(l=>ledgerRowHtml(l,false)).join('') || emptyHtml('check','Qarzingiz yo\'q');
}

function ratingBlockHtml(o){
  if(o.rating){
    return `<div class="ratingBlock"><span class="smallMuted" style="font-weight:700;">Bahoyingiz:</span> <span style="font-size:16px;">${'⭐'.repeat(o.rating)}</span></div>`;
  }
  const stars = [1,2,3,4,5].map(n=>`<button class="starBtn" onclick="rateOrder('${o.id}',${n})">${ic('star',20)}</button>`).join('');
  return `<div class="ratingBlock"><div class="smallMuted" style="font-weight:700;margin-bottom:6px;">Xizmatimizni baholang:</div><div class="starRow">${stars}</div></div>`;
}
