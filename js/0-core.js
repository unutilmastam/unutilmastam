/* Unutilmas Ta'm — 0-core
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function ic(name, size=18, cls=''){
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}

function mountIcons(){
  const map = {
    'ic-topbar-logo':['logo',17,'stroke:#fff'],
    'ic-hamburger':['menu',20,'stroke:var(--ink)'],
    'ic-settings':['settings',16,'stroke:#fff'],
    'ic-settings-drawer':['settings',18,'stroke:var(--ink)'],
    'ic-calc-drawer':['calc',18,'stroke:var(--ink)'],
    'ic-tally-drawer':['bolt',18,'stroke:var(--ink)'],
    'ic-printer-test':['printer',18,'stroke:var(--ink)'],
    'ic-sys-health':['pulse',18,'stroke:var(--ink)'],
    'ic-tally-receipt':['receipt',16,'stroke:#fff'],
    'ic-receipt-print':['receipt',15,'stroke:currentColor'],
    'ic-cr-print':['receipt',15,'stroke:currentColor'],
    'ic-tally-drawer':['bolt',18,'stroke:var(--ink)'],
    'ic-tally-receipt':['receipt',16,'stroke:#fff'],
    'ic-tally-drawer':['bolt',18,'stroke:var(--ink)'],
    'ic-tally-receipt':['receipt',16,'stroke:#fff'],
    'ic-broadcast-drawer':['megaphone',18,'stroke:var(--ink)'],
    'ic-productupdate-drawer':['tag',18,'stroke:var(--ink)'],
    'ic-darkmode-icon':['moon',18,'stroke:var(--ink)'],
    'ic-fav-view':['heart',17,'stroke:var(--danger)'],
    'ic-promo-remove':['x',13,'stroke:var(--danger)'],
    'ic-promo-drawer':['ticket',18,'stroke:var(--ink)'],
    'ic-couriers-drawer':['navigation',18,'stroke:var(--ink)'],
    'ic-reg-hero-arrow':['chev',16,'stroke:#fff'],
    'ic-admin-toggle':['shield',15,'stroke:var(--forest-dark)'],
    'ic-regchoice-user':['user',26,'stroke:var(--forest-dark)'],
    'ic-regchoice-store':['store',26,'stroke:var(--forest-dark)'],
    'ic-regchoice-arrow-1':['chev',18,'stroke:var(--muted)'],
    'ic-regchoice-arrow-2':['chev',18,'stroke:var(--muted)'],
    'ic-receipt-pdf':['receipt',15,'stroke:var(--ink)'],
    'ic-receipt-img':['download',15,'stroke:#fff'],
    'ic-pc-add':['plus',16,'stroke:#fff'],
    'ic-zone-drawer':['zone',18,'stroke:var(--ink)'],
    'ic-zone-add':['plus',16,'stroke:#fff'],
    'ic-courier-nav':['navigation',16,'stroke:#fff'],
    'ic-add-expense':['plus',15,'stroke:var(--forest)'],
    'ic-bc-send':['megaphone',16,'stroke:#fff'],'ic-pu-send':['megaphone',16,'stroke:#fff'],
    'ic-bc-template':['tag',15,'stroke:var(--forest-dark)'],
    'ic-btb-arrow':['chev',14,'stroke:#fff'],
    'ic-admin-account':['user',16,'stroke:#fff'],
    'ic-account-drawer':['user',17,'stroke:#fff'],
    'ic-calc-receipt':['receipt',16,'stroke:#fff'],
    'ic-cr-pdf':['receipt',15,'stroke:var(--ink)'],'ic-cr-img':['download',15,'stroke:#fff'],
    'ic-stat-products':['box',16],'ic-stat-stock':['grid',16],'ic-stat-debt':['card',16],'ic-stat-orders':['receipt',16],
    'ic-stat-users':['users',16],'ic-stat-revenue':['trend',16],'ic-stat-revenue-prev':['chart',16],
    'ic-cust-debt':['card',16],'ic-cust-orders':['receipt',16],
    'ic-add-product':['plus',14],'ic-add-store':['plus',14],'ic-add-cat':['plus',15],'ic-add-cat2':['plus',14],
    'ic-catalog-search':['search',16],
    'ic-map-expand':['grid',13],
    'ic-fullmap-back':['chev',15,'transform:scaleX(-1)'],
    'ic-search-go':['search',17,'stroke:#fff'],
    'ic-mode-in':['box',15],'ic-mode-out':['cart',15],
    'ic-cam-on':['camera',15],'ic-cam-off':['camOff',15],
    'ic-pin':['pin',15],'ic-ns-pin':['pin',15],'ic-ot-pin':['pin',15],'ic-ot-pin2':['pin',15],'ic-bell':['bell',17,'stroke:#fff'],'ic-photo-default':['user',22],'ic-photo-upload2':['camera',14],'ic-store-auto':['check',13],'ic-recenter-mini':['locate',20],'ic-recenter-full':['locate',20],
    'ic-bo-phone':['phone',12],'ic-pl-pin1':['pin',15],'ic-pl-pin2':['pin',15],
    'ic-upload':['upload',22],
    'ic-basket':['cart',15],
    'ic-trash-prod':['trash',14],'ic-trash-store':['trash',14],'ic-trash-ledger':['trash',14],
    'ic-pd-minus':['minus',15],'ic-pd-plus':['plus',15],'ic-pd-cart':['cart',16],'ic-pd-buy':['check',16],'ic-eo-trash':['trash',15],'ic-chat-send':['chev',18,'transform:rotate(-90deg);stroke:#fff'],
    'ic-chat-attach':['paperclip',18,'stroke:var(--forest-dark)'],'ic-chat-mic':['mic',18,'stroke:var(--forest-dark)'],
    'ic-chat-block':['block',16,'stroke:var(--danger)'],'ic-chat-editing':['edit',12,'stroke:#725728'],
    'ic-chat-call':['phone',16,'stroke:var(--forest-dark)'],
    'ic-call-mute':['mic',22,'stroke:#fff'],'ic-call-speaker':['speaker',22,'stroke:#fff'],
    'ic-call-decline':['phone',26,'stroke:#fff;transform:rotate(135deg)'],'ic-call-accept':['phone',26,'stroke:#fff'],
    'ic-courier-reject':['x',26,'stroke:#fff'],'ic-courier-accept':['check',26,'stroke:#fff'],
    'ic-imgview-close':['x',18,'stroke:#fff'],
    'ic-ot-personal':['user',15],'ic-ot-store':['store',15],
    'ic-an-qty':['box',16],'ic-an-kg':['scale',16],'ic-an-rev':['card',16],'ic-an-cmp':['trend',16],
  };
  Object.entries(map).forEach(([id,[name,size,style]])=>{
    const el = document.getElementById(id);
    if(el){ el.innerHTML = ic(name,size); if(style) el.querySelector('svg').style.cssText+=style; }
  });
  document.querySelectorAll('.modalClose').forEach(b=>b.innerHTML = ic('x',15));
}

function uid(p){ return p + '_' + Math.random().toString(36).slice(2,9); }

function todayISO(){ return new Date().toISOString().slice(0,10); }

function nowTs(){ return Date.now(); }

function fmt(n){ return (Math.round(n||0)).toLocaleString('ru-RU'); }

/* Telefon raqami yoniga bosilganda avtomatik qo'ng'iroq qiluvchi qator.
   phone, extraPhones (array) — ixtiyoriy. removable bo'lsa, har bir
   qo'shimcha raqam yonida o'chirish (×) tugmasi chiqadi
   (onRemove(index) chaqiriladi). */
function phoneCallRowsHtml(phone, extraPhones, onRemove){
  const all = [];
  if(phone) all.push({ph: phone, extra:false, idx:-1});
  (extraPhones||[]).forEach((p, i) => { if(p) all.push({ph: p, extra:true, idx:i}); });
  if(!all.length) return '';
  return all.map(function(item){
    const clean = item.ph.replace(/[^\d+]/g,'');
    const removeBtn = (item.extra && onRemove)
      ? `<button type="button" class="tinyIconBtn danger phoneRowDel" onclick="event.preventDefault();event.stopPropagation();${onRemove}(${item.idx})">${ic('x',13)}</button>`
      : '';
    return `<a class="phoneCallRow" href="tel:${clean}">
      <span class="phoneCallIcon">${ic('phone',15)}</span>
      <span class="phoneCallNum">${item.ph}</span>
      ${removeBtn}
    </a>`;
  }).join('');
}

/* Mahsulotning magazin (ulgurji) narxi — kiritilmagan bo'lsa chakana narx */
function storePriceOf(p){
  if(!p) return 0;
  const sp = Number(p.priceStore);
  return (sp && sp > 0) ? sp : (Number(p.price) || 0);
}

/* ASOSIY FUNKSIYA: kim ko'rayotganiga qarab narx qaytaradi.
   mode: 'auto' (default) | 'customer' | 'store' — kalkulyator uchun majburlash */
function priceOf(p, mode){
  if(!p) return 0;
  const m = mode || 'auto';
  if(m === 'store') return storePriceOf(p);
  if(m === 'customer') return Number(p.price) || 0;
  return isStoreBuyer() ? storePriceOf(p) : (Number(p.price) || 0);
}

/* Avvalgi (chizilgan) narx — chegirma foizini to'g'ri hisoblash uchun */
function oldPriceOf(p, mode){
  if(!p || !p.originalPrice) return null;
  const now = priceOf(p, mode);
  return (p.originalPrice > now) ? p.originalPrice : null;
}

/* Narx yorlig'i — magazin narxini ko'rsatayotganda bildirib turamiz */
function priceBadgeHtml(p, mode){
  const m = mode || 'auto';
  const isStore = (m === 'store') || (m === 'auto' && isStoreBuyer());
  if(!isStore) return '';
  const sp = Number(p && p.priceStore);
  if(!(sp && sp > 0)) return '';
  return '<span class="wholesaleTag">ulgurji</span>';
}

function prodThumb(p, sz){
  if(p && p.image) return `<img src="${p.image}" alt="${p.name}">`;
  return ic('bowl', sz||24);
}

function checkForNewNotifications(){
  const key = notifRecipientKey();
  if(!key) return;
  const mine = (state.notifications||[]).filter(n=>n.recipient===key);
  if(__seenNotifIds === null){
    // Birinchi yuklanishda — mavjud tarixni "ko'rilgan" deb belgilaymiz, signal bermaymiz
    __seenNotifIds = new Set(mine.map(n=>n.id));
    return;
  }
  const fresh = mine.filter(n=>!__seenNotifIds.has(n.id));
  fresh.forEach(n=>{
    __seenNotifIds.add(n.id);
    playNotifSound();
    if(navigator.vibrate) try{ navigator.vibrate([90,50,90]); }catch(e){}
    showBrowserNotification(n.title, n.body);
  });
}

/* Foydalanuvchi ro'yxatdan o'tayotganda shaxsiy IP manzilini avtomatik aniqlash */
async function fetchPublicIp(){
  try{
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 4000);
    const res = await fetch('https://api.ipify.org?format=json', {signal:ctrl.signal});
    clearTimeout(t);
    const data = await res.json();
    return data.ip || null;
  }catch(e){ return null; }
}

function openRegisterChoiceModal(){
  closeModal('modalAuth');
  setTimeout(()=>openModal('modalRegisterChoice'), 180);
}

function renderFooter(){
  applyHeroText();
  const si = state.sellerInfo;
  const links = [
    {url:si.telegram, icon:'telegram', label:'Telegram'},
    {url:si.instagram, icon:'instagram', label:'Instagram'},
    {url:si.channel, icon:'telegram', label:'Telegram kanal'},
    {url:si.youtube, icon:'youtube', label:'YouTube'},
    {url: si.phone ? 'tel:'+si.phone.replace(/\s/g,'') : '', icon:'phone', label:'Telefon'},
  ].filter(l=>l.url);
  const linksHtml = links.map(l=>`<a class="socialBtn" href="${l.url}" target="_blank" rel="noopener" title="${l.label}">${ic(l.icon,16)}</a>`).join('');
  document.getElementById('sellerInfoCard').innerHTML = `
    <div class="eyebrow">Sotuvchi ma'lumotlari</div>
    <h3>Unutilmas Ta'm</h3>
    ${si.address?`<div class="metaRow">${ic('pin',13)}<span class="meta" style="color:#C9B0A0;">${si.address}</span></div>`:''}
    ${si.phone?`<div class="metaRow">${ic('phone',13)}<span class="meta" style="color:#C9B0A0;">${si.phone}</span></div>`:''}
    ${si.about?`<p class="meta" style="margin-top:6px;">${si.about}</p>`:''}
    <div class="socialRow" id="socialRow" style="justify-content:flex-start;margin:10px 0 0;">${linksHtml}${si.devBtnHide?'':`<button class="devBtn" onclick="window.open('https://itcode.uz','_blank')" title="${si.devBtnText||'Dastur yaratish'}">
      <span class="devBtnIc"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6A99B5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
      <span class="devBtnTx">${si.devBtnText||'Dastur yaratish'}</span>
    </button>`}</div>
    <div class="installFabStack">
      ${si.installUrl?`
      <button class="installFab installFabIos" onclick="openInstallModal()" title="iPhone'ga o'rnatish">
        <span class="installFabRing"></span>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.03 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702z"/></svg>
        <span class="installFabTx">iPhone</span>
      </button>`:''}
      ${(si.apkUrl && !si.androidBtnHide)?`
      <button class="installFab installFabAndroid" onclick="openAndroidModal()" title="Android'ga yuklab olish">
        <span class="installFabRing installFabRingGreen"></span>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="#fff"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0005.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.416.416 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396"/></svg>
        <span class="installFabTx">Android</span>
      </button>`:''}
    </div>
  `;
}

/* ---- Chapdan chiquvchi menyu ---- */
function openSideMenu(){
  document.body.classList.add('menuOpen');   // orqadagi sahifa surilmasin
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('sideMenuOverlay').classList.add('open');
  document.getElementById('sideMenuSettingsWrap').classList.toggle('hidden', !(currentUser && currentUser.role==='admin'));
  refreshLangUI();
  applyDarkMode();
}

function closeSideMenu(){
  document.body.classList.remove('menuOpen');
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('sideMenuOverlay').classList.remove('open');
}

function applyDarkMode(){
  document.body.classList.toggle('darkMode', darkMode);
  const sw = document.getElementById('darkModeSwitch');
  if(sw) sw.classList.toggle('on', darkMode);
}

function toggleDarkMode(){
  darkMode = !darkMode;
  try{ localStorage.setItem('utam_dark', darkMode ? '1' : '0'); }catch(e){}
  applyDarkMode();
}

function refreshLangUI(){
  /* Til tugmalari olib tashlangan — mavjud bo'lsa yangilaymiz */
  const lu = document.getElementById('langOptUz');
  const lr = document.getElementById('langOptRu');
  if(lu) lu.classList.toggle('active', appLang==='uz');
  if(lr) lr.classList.toggle('active', appLang==='ru');
}

function refreshShell(){
  document.getElementById('whoLabel').textContent = currentUser ? (currentUser.role==='admin' ? trLabel('Siz · Admin') : currentUser.name) : trLabel('Xush kelibsiz!');
  const rb = document.getElementById('topRightBtn');
  /* Kirgan bo'lsa — faqat odamcha ikonkasi (profil oynasini ochadi).
     Kirmagan bo'lsa — "Kirish" yozuvi bilan. */
  if(currentUser){
    rb.innerHTML = ic('user',18);
    rb.classList.add('iconOnlyBtn');
    rb.title = trLabel('Profil');
  }else{
    rb.innerHTML = ic('user',14)+'<span>'+trLabel('Kirish')+'</span>';
    rb.classList.remove('iconOnlyBtn');
    rb.title = trLabel('Kirish');
  }
  // Sozlamalar endi chapdagi menyu ichida — ko'rinishi drawer ochilganda tekshiriladi
  /* "Mening hisobim" endi o'ng tomondagi menyu (3 chiziqcha) ichida — refreshShell'da kerak emas */
  refreshNotifBadge();
  updateBasketCount();
  buildNav();
  setupCallListenerForCurrentUser();
  refreshStoreGate();      // tasdiqlanmagan magazin egasiga ilova yopiladi
  refreshPendingStoreBadge();
  try{ initTallyMode(); }catch(e){}   // tez hisob rejimi (admin)
  try{ syncBonusMasterUI(); }catch(e){}   // BONUSLAR umumiy kaliti (admin)
  try{ refreshAdminClock(); }catch(e){}  // yon menyu: qizil tugma yoki soat
  try{ if(typeof tgAutoLogin==='function') tgAutoLogin(); }catch(e){}  // Telegram avtomatik kirish
}

function trLabel(uzText){
  if(appLang !== 'ru') return uzText;
  return TR_RU[uzText] || uzText;
}

/* ---- Butun sahifani (istalgan oyna/bo'lim, faol yoki yashirin) ikki
   tomonlama tarjima qilish. Ba'zi sarlavhalar HTML shablonida qattiq
   yozilgani uchun (JS orqali qayta chizilmaydi), til almashtirilganda
   FAQAT joriy ochiq bo'limni emas, BUTUN sahifani (barcha yashiringan
   bo'limlarni ham) shu lug'at bo'yicha aylantirib chiqamiz — shu tufayli
   orqaga (RU->UZ) qaytarish ham to'liq va ishonchli ishlaydi. */
function translateDOM(root, dict){
  if(!root || !dict) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node=>{
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if(!trimmed) return;
    const t = dict[trimmed];
    if(t) node.nodeValue = raw.replace(trimmed, t);
  });
  root.querySelectorAll ? root.querySelectorAll('[placeholder],[title]').forEach(el=>{
    ['placeholder','title'].forEach(attr=>{
      const v = el.getAttribute(attr);
      if(v && dict[v]) el.setAttribute(attr, dict[v]);
    });
  }) : null;
}

function buildNav(){
  const nav = document.getElementById('bottomNav');
  nav.innerHTML = '';
  /* Faol band ostida siljiydigan oval */
  const glider = document.createElement('div');
  glider.className = 'navGlider';
  glider.id = 'navGlider';
  nav.appendChild(glider);
  NAVS[currentRoleKey()].forEach(n=>{
    const b = document.createElement('button');
    b.className = 'navBtn'; b.id = 'nav-'+n.id;
    const label = trLabel(n.tx);
    if(n.id==='savat'){
      b.innerHTML = `<span style="position:relative;display:inline-flex;">${ic(n.icon,19)}<span class="navBadge hidden" id="navBasketBadge">0</span></span><div class="tx">${label}</div>`;
    } else {
      b.innerHTML = `${ic(n.icon,19)}<div class="tx">${label}</div>`;
    }
    b.onclick = ()=>showView(n.id);
    nav.appendChild(b);
  });
  /* Bandlar ko'p bo'lsa yozuvlarsiz ixcham ko'rinish */
  nav.classList.toggle('compact', nav.querySelectorAll('.navBtn').length > 5);
  updateBasketCount();
  requestAnimationFrame(moveNavGlider);
}

/* Ovalni faol band ustiga suradi */
function moveNavGlider(){
  const nav = document.getElementById('bottomNav');
  const g = document.getElementById('navGlider');
  if(!nav || !g) return;
  const act = nav.querySelector('.navBtn.active');
  if(!act){ g.classList.remove('on'); return; }
  const nr = nav.getBoundingClientRect();
  const ar = act.getBoundingClientRect();
  if(!ar.width) return;
  g.style.width = ar.width + 'px';
  g.style.transform = 'translateX(' + (ar.left - nr.left) + 'px)';
  g.classList.add('on');
}

window.addEventListener('resize', function(){ requestAnimationFrame(moveNavGlider); });
window.addEventListener('orientationchange', function(){ setTimeout(moveNavGlider, 240); });

function showView(id){
  // Xavfsizlik: agar tanishtiruv oynasi negadir ochiq turgan bo'lsa, foydalanuvchi
  // biror joyga o'tishga harakat qilganda uni darhol yopamiz — u boshqa hech qachon
  // bosishlarni to'smasin.
  const onb = document.getElementById('onboardingBg');
  if(onb && !onb.classList.contains('hidden')) finishOnboarding();
  if(id==='savat'){ renderBasketModal(); openModal('modalBasket'); return; }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const el = document.getElementById('v-'+id);
  if(el) el.classList.add('active');
  document.querySelectorAll('.navBtn').forEach(b=>b.classList.remove('active'));
  const nb = document.getElementById('nav-'+id);
  if(nb) nb.classList.add('active');
  requestAnimationFrame(moveNavGlider);
  renderView(id);
}

function renderView(id){
  if(id==='dash') renderDash();
  if(id==='products') renderProducts();
  if(id==='scan') renderScanStoreOptions();
  if(id==='qarz') renderDebtsAdmin();
  if(id==='chat') renderChatList();
  if(id==='analytics') renderAnalytics();
  if(id==='stores') renderStores();
  if(id==='orders') renderOrdersAdmin();
  if(id==='catalog'){ renderCatalog(); renderFooter(); }
  if(id==='cabinet') renderCabinet();
}

/* ==================== MODALS ==================== */
/* Ba'zi oynalar boshqasining USTIGA ochiladi va uni yopmaydi.
   Masalan: tez hisob ochiq turганda chek yoki tasdiqlash oynasi chiqadi. */
const STACKED_MODALS = ['modalCalcReceipt', 'modalTallyConfirm', 'modalPrintShop', 'modalStorePick',
  'modalAddDebt', 'modalLedgerDetail', 'modalEditLedger', 'modalPay', 'modalDebtMessage', 'modalBonus',
  'modalPayRequest', 'modalRewardSettings', 'modalBonusList'];
let __modalZ = 1000;

function openModal(id){
  if(STACKED_MODALS.indexOf(id) === -1){
    document.querySelectorAll('.modalBg').forEach(m=>{ if(m.id!==id){ m.classList.add('hidden'); m.style.zIndex=''; } });
    __modalZ = 1000;
  }
  const el = document.getElementById(id);
  /* Ustma-ust ochilgan oyna DOIM tepada turadi — ilgari HTML dagi
     tartibga qarab ba'zan orqada qolib ketardi */
  el.style.zIndex = String(++__modalZ);
  el.classList.remove('hidden');
}

function closeModal(id){
  document.getElementById(id).classList.add('hidden');
  /* Tez hisob cheki yopilganda tanlangan mahsulotlar tozalanadi */
  if(id === 'modalCalcReceipt'){
    try{ if(typeof onCalcReceiptClosed === 'function') onCalcReceiptClosed(); }catch(e){}
  }
}

function emptyHtml(iconName,txt){ return `<div class="empty"><div class="icWrap">${ic(iconName,22)}</div><div class="t">${txt}</div></div>`; }

function showBrowserNotification(title, body){
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification(title, {body}); }catch(e){ console.error('Notification xato', e); }
  }
}

async function pushNotification(recipient, title, body, type, ref){
  if(!recipient) return;
  state.notifications.push({id:uid('n'), recipient, title, body, type:type||'info', ref: ref||null, date:new Date().toISOString(), read:false});
  await saveState();
  if(notifRecipientKey()===recipient){ showBrowserNotification(title, body); }
  refreshNotifBadge();
}

async function openNotificationsModal(){
  await ensureNotifPermission();
  const key = notifRecipientKey();
  const box = document.getElementById('notifList');
  const mine = key ? state.notifications.filter(n=>n.recipient===key).slice().reverse() : [];
  box.innerHTML = mine.map(n=>{
    const clickable = n.ref && n.ref.type;
    const ord = (n.ref && n.ref.type==='order') ? state.orders.find(o=>o.id===n.ref.id) : null;
    const itemsHtml = ord ? itemChipsHtml(ord.items,{gram:true}) : '';
    let prodThumbsHtml = '';
    if(n.ref && (n.ref.type==='product' || n.ref.type==='products')){
      const ids = n.ref.type==='product' ? [n.ref.id] : (n.ref.ids||[]);
      const prods = ids.map(id=>state.products.find(p=>p.id===id)).filter(Boolean);
      if(prods.length){
        prodThumbsHtml = `<div class="itemChips">` + prods.map(p=>`<span class="itemChip" style="background:var(--leaf-soft);color:var(--forest-dark);">${p.image?`<img class="icThumb" src="${p.image}">`:`<span class="icThumb icThumbBlank">${ic('box',11)}</span>`}${p.name}</span>`).join('') + `</div>`;
      }
    }
    const downloadBtnHtml = n.downloadUrl ? `<button class="primaryBtn" style="margin-top:10px;padding:10px;" onclick="event.stopPropagation();downloadAppFromNotif('${n.downloadUrl}')">${ic('download',15)}Ilovani yuklab olish</button>` : '';
    return `
    <div class="card notifCard${clickable?' notifCardClick':''}" ${clickable?`onclick="handleNotifClick('${n.id}')"`:''}>
      <div class="row"><div class="title">${n.title}</div>${!n.read?'<span class="badge amber">Yangi</span>':''}</div>
      <div class="meta">${n.body}</div>
      ${itemsHtml}${prodThumbsHtml}${downloadBtnHtml}
      <div class="meta smallMuted" style="margin-top:4px;">${new Date(n.date).toLocaleString('uz-UZ')}</div>
      ${clickable?`<div class="notifOpenHint">${ic('chev',12)} Ko'rish uchun bosing</div>`:''}
    </div>
  `;}).join('') || emptyHtml('receipt','Bildirishnomalar yo\'q');
  openModal('modalNotifications');
  mine.forEach(n=>{ n.read = true; });
  if(mine.length){ await saveState(); }
  refreshNotifBadge();
}

/* Bildirishnomaga bosilganda tegishli joyga o'tish */
function handleNotifClick(notifId){
  const n = state.notifications.find(x=>x.id===notifId);
  if(!n || !n.ref) return;
  closeModal('modalNotifications');
  const isAdmin = currentUser && currentUser.role==='admin';
  const {type, id} = n.ref;
  if(type==='order'){
    const exists = state.orders.some(o=>o.id===id);
    if(!exists){ return; }
    if(isAdmin){
      ordersAdminFilter = 'all'; setOrdersAdminFilter('all');
      openOrderRowId = id;
      showView('orders');
      setTimeout(()=>scrollToAndFlash('odetail-'+id, true), 220);
    } else {
      showView('cabinet');
      setTimeout(()=>scrollToAndFlash('ocard-'+id), 220);
    }
  } else if(type==='debt'){
    const exists = state.ledger.some(l=>l.id===id);
    if(!exists) return;
    showView(isAdmin ? 'qarz' : 'cabinet');
    setTimeout(()=>openLedgerDetail(id), 260);
  } else if(type==='chat'){
    if(isAdmin) adminOpenChat(id);
    else openOrderChat(null);
  } else if(type==='product'){
    const p = state.products.find(x=>x.id===id);
    if(!p) return;
    showView('catalog');
    setTimeout(()=>openProductDetail(id), 250);
  } else if(type==='products'){
    showView('catalog');
  }
}

function formatProductAmount(p){
  if(!p.gram) return '';
  const unitType = p.unitType || 'gram';
  return `${p.gram} ${UNIT_LABELS[unitType]}`;
}

async function scanLoopTick(){
  const video = document.getElementById('video');
  if(!video || !video.srcObject){ return; } // to'xtatilgan
  if(video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0){
    try{
      if(nativeDetector){
        const codes = await nativeDetector.detect(video);
        if(codes && codes.length){ maybeHandleScan(codes[0].rawValue); }
      } else if(typeof jsQR === 'function'){
        scanCanvas.width = video.videoWidth; scanCanvas.height = video.videoHeight;
        scanCtx.drawImage(video,0,0,scanCanvas.width,scanCanvas.height);
        const imgData = scanCtx.getImageData(0,0,scanCanvas.width,scanCanvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {inversionAttempts:'attemptBoth'});
        if(code && code.data){ maybeHandleScan(code.data); }
      }
    }catch(e){ /* bir freym xato bo'lsa ham skanerlashni davom ettiramiz */ }
  }
  // Real skaner tezligiga yaqin: sekundiga ~8 marta tekshiramiz — batareya/CPU tejaydi va barqaror ishlaydi
  scanLoopTimer = setTimeout(()=>{ scanLoopId = requestAnimationFrame(scanLoopTick); }, 110);
}

function setAnalyticsPeriod(p){
  analyticsPeriod = p;
  ['Day','Week','Month','Prevmonth'].forEach(x=>document.getElementById('periodBtn'+x).classList.toggle('active', x.toLowerCase()===p));
  renderAnalytics();
}

function renderAnalytics(){
  try{ renderTallyAnalytics(); }catch(e){}
  const now = new Date();
  let fromTs, toTs;
  if(analyticsPeriod==='day'){ const d=new Date(); d.setHours(0,0,0,0); fromTs=d.getTime(); }
  else if(analyticsPeriod==='week'){ fromTs = nowTs()-7*86400000; }
  else if(analyticsPeriod==='prevmonth'){
    fromTs = new Date(now.getFullYear(), now.getMonth()-1, 1).getTime();
    toTs   = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  else { const d=new Date(now.getFullYear(), now.getMonth(), 1); fromTs=d.getTime(); }

  const sales = salesInRange(fromTs, toTs);
  const qty = sales.length;
  const kg = sales.reduce((s,x)=>s+x.gram,0)/1000;
  const revenue = sales.reduce((s,x)=>s+x.price,0);
  document.getElementById('anQty').textContent = fmt(qty);
  document.getElementById('anKg').textContent = kg.toFixed(1);
  document.getElementById('anRevenue').textContent = fmt(revenue);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1).getTime();
  const thisMonthRevenue = state.sales.filter(s=>s.ts>=thisMonthStart).reduce((s,x)=>s+x.price,0);
  const lastMonthRevenue = state.sales.filter(s=>s.ts>=lastMonthStart && s.ts<thisMonthStart).reduce((s,x)=>s+x.price,0);
  const cmpEl = document.getElementById('anCompare');
  if(lastMonthRevenue<=0 && thisMonthRevenue<=0){
    cmpEl.innerHTML = '—'; cmpEl.className='num';
  } else if(lastMonthRevenue<=0){
    cmpEl.innerHTML = 'Yangi'; cmpEl.className='num';
  } else {
    const pct = ((thisMonthRevenue-lastMonthRevenue)/lastMonthRevenue*100);
    const up = pct>=0;
    cmpEl.innerHTML = `${up?'+':''}${pct.toFixed(1)}%`;
    cmpEl.style.color = up ? 'var(--success)' : 'var(--danger)';
  }

  const byProduct = {};
  sales.forEach(s=>{
    if(!byProduct[s.productId]) byProduct[s.productId] = {name:s.productName, qty:0, kg:0, revenue:0};
    byProduct[s.productId].qty += 1;
    byProduct[s.productId].kg += s.gram/1000;
    byProduct[s.productId].revenue += s.price;
  });
  const rows = Object.values(byProduct).sort((a,b)=>b.revenue-a.revenue);
  const maxRev = Math.max(1, ...rows.map(r=>r.revenue));
  document.getElementById('anProductList').innerHTML = rows.map(r=>`
    <div class="barRow">
      <div class="lbl"><span>${r.name} · ${r.qty} dona · ${r.kg.toFixed(1)} kg</span><span>${fmt(r.revenue)} so'm</span></div>
      <div class="barTrack"><div class="barFill" style="width:${(r.revenue/maxRev*100).toFixed(0)}%"></div></div>
    </div>
  `).join('') || emptyHtml('chart','Bu davrda savdo bo\'lmagan');

  renderSalesChart();
  renderBestSellers(rows);
  renderVipCustomers();
  renderExpenses();
  renderWinback();
  renderStockForecast();
  renderCustomerHeatmap();
}

function pickNsOwner(){
  const pickedId = document.getElementById('nsOwnerPick').value;
  if(pickedId){
    const u = state.users.find(x=>x.id===pickedId);
    if(u){
      document.getElementById('nsName').value = u.storeName || '';
      document.getElementById('nsOwnerName').value = u.name || '';
      document.getElementById('nsAddr').value = u.address || '';
      document.getElementById('nsPhone').value = /^[+\d]/.test(u.contact||'') ? u.contact : '';
    }
  } else {
    document.getElementById('nsName').value = '';
    document.getElementById('nsOwnerName').value = '';
    document.getElementById('nsAddr').value = '';
    document.getElementById('nsPhone').value = '';
  }
}

function escName(t){ return (t||'').replace(/'/g,''); }

function pickSdOwner(){
  const pickedId = document.getElementById('sdOwnerPick').value;
  sdSelectedOwnerUserId = pickedId || null;
  const locNote = document.getElementById('sdOwnerLocNote');
  if(pickedId){
    const u = state.users.find(x=>x.id===pickedId);
    if(u){
      document.getElementById('sdStoreName').value = u.storeName || '';
      document.getElementById('sdOwnerName').value = u.name || '';
      document.getElementById('sdAddr').value = u.address || '';
      document.getElementById('sdPhone').value = /^[+\d]/.test(u.contact||'') ? u.contact : '';
      // Ro'yxatdan o'tishda belgilagan joylashuvi avtomatik olinadi
      if(typeof u.homeLat==='number' && sdLatLng){
        sdLatLng = {lat: u.homeLat, lng: u.homeLng};
        if(locNote){ locNote.style.display='block'; locNote.innerHTML = `${ic('pin',12)} Joylashuv avtomatik olindi — ro'yxatdan o'tishda belgilagan nuqtasi`; }
      } else if(locNote){ locNote.style.display='none'; }
    }
  } else {
    if(locNote) locNote.style.display='none';
    document.getElementById('sdStoreName').value = '';
    document.getElementById('sdOwnerName').value = '';
    document.getElementById('sdAddr').value = '';
    document.getElementById('sdPhone').value = '';
  }
}

function toggleSdProductPicker(){
  sdPickerOpen = !sdPickerOpen;
  const box = document.getElementById('sdProductPicker');
  if(!box) return;
  if(sdPickerOpen){
    box.classList.remove('hidden');
    box.innerHTML = state.products.map(p=>`
      <div class="card catCard" style="cursor:default;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="prodThumbSm">${prodThumb(p,18)}</div>
          <div><div class="title">${p.name}</div><div class="meta">${p.gram} g · ${fmt(priceOf(p,'store'))} so'm</div></div>
        </div>
        <div class="qtyBox">
          <button onclick="changeSdQty('${p.id}',-1)">${ic('minus',13)}</button>
          <span id="pp-qty-${p.id}">${sdDraft[p.id]||0}</span>
          <button onclick="changeSdQty('${p.id}',1)">${ic('plus',13)}</button>
        </div>
      </div>
    `).join('') || emptyHtml('box','Mahsulot qo\'shilmagan');
  } else {
    box.classList.add('hidden');
  }
}

function fmtDeliveryTime(v){
  try{ const d = new Date(v); return d.toLocaleString('uz-UZ', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}); }
  catch(e){ return v; }
}

/* Magazin egasiga qaysi narxni ko'rayotganini bildiramiz.
   Iste'molchiga hech narsa ko'rsatilmaydi — unga bu ma'lumot keraksiz. */
function refreshPriceModeBanner(){
  const el = document.getElementById('priceModeBanner');
  if(!el) return;
  if(previewMode){
    el.className = 'previewNote';
    el.textContent = "Mahsulotlar bilan tanishyapsiz. Narxlar va buyurtma hisobingiz tasdiqlangach ochiladi.";
    el.classList.remove('hidden');
    return;
  }
  el.className = 'priceModeBanner';
  if(isStoreBuyer()){
    el.innerHTML = "<span class='pmbDot'></span>Magazin egasi narxlari (ulgurji) ko'rsatilmoqda";
    el.classList.remove('hidden');
  }else{
    el.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════════
   SERVERGA FAYL YUKLASH (rasm / ovoz)

   Ilgari rasm/ovoz to'g'ridan-to'g'ri base64 matn sifatida state
   ichiga (va shu orqali localStorage + Firestore'ga) yozilardi —
   aynan shu narsa telefon xotirasini to'ldirib, "xotira to'lib
   qoldi" xatosiga sabab bo'lgan.

   Endi: fayl shu hosting ichidagi upload.php orqali /uploads/
   papkasiga saqlanadi, state ichiga esa faqat QISQA URL yoziladi.
   ═══════════════════════════════════════════════════════════════ */

// upload.php shu index.html bilan bir papkada bo'lsa, o'zgartirish shart emas
const UPLOAD_ENDPOINT = 'upload.php';

// MUHIM: bu so'z upload.php ichidagi UPLOAD_SECRET bilan AYNAN BIR XIL
// bo'lishi shart, aks holda serverga yuklash rad etiladi.
const UPLOAD_SECRET = 'unutilmastam-2026-maxfiy-soz-almashtiring';

/**
 * dataUrl ("data:image/jpeg;base64,...") formatidagi faylni serverga
 * yuklaydi va muvaffaqiyatli bo'lsa uning URL manzilini qaytaradi.
 * folder: 'products' | 'chat-images' | 'chat-audio'
 * Xato bo'lsa — null qaytaradi va foydalanuvchiga xabar ko'rsatadi
 * (eski usulga — base64ni saqlashga — QAYTMAYDI, aks holda xotira
 * yana to'lib qolish xavfi qoladi).
 */
async function uploadDataUrlToHost(dataUrl, folder, silent){
  try{
    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({data: dataUrl, folder: folder, key: UPLOAD_SECRET})
    });
    let json = null;
    try{ json = await res.json(); }catch(e){}
    if(json && json.ok && json.url) return json.url;
    console.warn('Serverga yuklashda xato:', json && json.error, res.status);
    if(!silent) alert("Faylni serverga yuklab bo'lmadi" + (json && json.error ? (': ' + json.error) : '') + ". Internetni tekshirib, qayta urinib ko'ring.");
    return null;
  }catch(e){
    console.warn('Serverga yuklab bo\'lmadi:', e);
    if(!silent) alert("Faylni serverga yuklab bo'lmadi. Internet aloqasini tekshirib, qayta urinib ko'ring.");
    return null;
  }
}

// Fayl saqlashning eng ishonchli usuli: avval "Ulashish" (Share) oynasi orqali
// (ayniqsa iPhone'da eng barqaror ishlaydi), bo'lmasa oddiy yuklab olish havolasi orqali.
async function triggerFileSave(blob, filename, mime){
  /* ANDROID ILOVASI (WebView): blob: manzillarini WebView saqlay olmaydi,
     shuning uchun faylni base64 ga aylantirib Android tomoniga uzatamiz —
     u "Downloads" ga saqlaydi va ulashish oynasini ochadi. */
  if(window.__isAndroidApp && window.AndroidBridge && window.AndroidBridge.saveFile){
    try{
      const b64 = await new Promise((res, rej)=>{
        const r = new FileReader();
        r.onload  = ()=>res(String(r.result).split(',')[1]);
        r.onerror = ()=>rej(new Error('Faylni o\'qib bo\'lmadi'));
        r.readAsDataURL(blob);
      });
      window.AndroidBridge.saveFile(b64, filename, mime);
      return true;
    }catch(e){
      console.warn('Android ko\'prigi ishlamadi, oddiy usulga o\'tildi:', e);
    }
  }
  if(navigator.canShare){
    try{
      const file = new File([blob], filename, {type: mime});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title: filename});
        return true;
      }
    }catch(shareErr){
      if(shareErr && shareErr.name === 'AbortError') return false; // foydalanuvchi bekor qildi
      // ulashish ishlamasa, pastdagi zaxira usulga o'tamiz
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  return true;
}

function quickAddToCart(productId, evt){
  if(previewBlocked()) return;
  const p = state.products.find(x=>x.id===productId);
  if(!p || p.stock<=0) return;
  basket[productId] = (basket[productId]||0) + 1;
  updateBasketCount();

  // "Kartochka kichrayib savatga uchib tushish" animatsiyasi — haqiqiy mahsulot
  // kartochkasining nusxasi olinib, kichrayib borib, savat belgisiga uchib boradi.
  const targetEl = document.getElementById('navBasketBadge') || document.getElementById('nav-savat');
  const cardEl = evt && evt.currentTarget ? evt.currentTarget.closest('.prodCard') : null;
  if(cardEl && targetEl){
    const startRect = cardEl.getBoundingClientRect();
    const endRect = targetEl.getBoundingClientRect();
    const clone = cardEl.cloneNode(true);
    clone.classList.add('flyingCardClone');
    clone.style.width = startRect.width + 'px';
    clone.style.height = startRect.height + 'px';
    clone.style.left = startRect.left + 'px';
    clone.style.top = startRect.top + 'px';
    document.body.appendChild(clone);
    const dx = (endRect.left + endRect.width/2) - (startRect.left + startRect.width/2);
    const dy = (endRect.top + endRect.height/2) - (startRect.top + startRect.height/2);
    clone.style.setProperty('--dx', dx+'px');
    clone.style.setProperty('--dy', dy+'px');
    requestAnimationFrame(()=> clone.classList.add('flying'));
    setTimeout(()=>{
      clone.remove();
      targetEl.classList.add('bump');
      setTimeout(()=>targetEl.classList.remove('bump'), 350);
    }, 600);
  }

  // Tezkor vizual tasdiq (yashil "qo'shildi" chaqnashi)
  const cards = document.querySelectorAll('.prodCard');
  cards.forEach(c=>{
    if(c.getAttribute('onclick') && c.getAttribute('onclick').includes(`'${productId}'`)){
      c.classList.add('justAdded');
      setTimeout(()=>c.classList.remove('justAdded'), 500);
    }
  });
}

function renderTypingIndicator(){
  const chat = state.chats.find(x=>x.userId===activeChatUserId);
  const el = document.getElementById('chatTypingIndicator');
  if(!chat || !el) return;
  const isAdmin = currentUser && currentUser.role==='admin';
  const otherTyping = isAdmin ? chat.userTyping : chat.adminTyping;
  const isRecent = otherTyping && (Date.now() - otherTyping < 3000);
  el.classList.toggle('hidden', !isRecent);
}

async function toggleVoiceRecording(){
  if(voiceRecorder && voiceRecorder.state==='recording'){ voiceRecorder.stop(); return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ alert("Bu qurilmada ovoz yozib bo'lmaydi"); return; }
  try{
    voiceStream = await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){ alert("Mikrofonga ruxsat berilmadi"); return; }
  voiceChunks = [];
  voiceRecorder = new MediaRecorder(voiceStream);
  voiceRecorder.ondataavailable = e=>{ if(e.data.size>0) voiceChunks.push(e.data); };
  voiceRecorder.onstop = async ()=>{
    clearInterval(voiceTimerInt);
    document.getElementById('chatRecordingBar').classList.add('hidden');
    document.getElementById('chatMicBtn').classList.remove('recording');
    try{ voiceStream.getTracks().forEach(t=>t.stop()); }catch(e){}
    if(voiceChunks.length && !voiceCancelled){
      const blob = new Blob(voiceChunks, {type: voiceRecorder.mimeType || 'audio/webm'});
      const reader = new FileReader();
      reader.onload = async ()=>{
        // Ovozni endi state ichiga base64 qilib emas — serverga yuklab,
        // faqat URL'ini saqlaymiz (xotirani to'ldirmaslik uchun).
        const audioUrl = await uploadDataUrlToHost(String(reader.result), 'chat-audio');
        if(!audioUrl) return; // yuklanmadi — xabar allaqachon ko'rsatildi, qayta urinib ko'radi
        const isAdmin = currentUser && currentUser.role==='admin';
        const chat = getOrCreateChat(activeChatUserId, isAdmin ? (state.chats.find(x=>x.userId===activeChatUserId)||{}).userName : currentUser.name);
        chat.messages.push({from: isAdmin?'admin':'user', audio: audioUrl, time: new Date().toISOString()});
        if(isAdmin){ chat.unreadUser = true; } else { chat.unreadAdmin = true; }
        await saveState();
        renderChatThread();
        if(isAdmin){ pushNotification(activeChatUserId, 'Ishlab chiqaruvchidan ovozli xabar', '🎤 Ovozli xabar', 'chat', {type:'chat', id:activeChatUserId}); }
        else { pushNotification('admin', `${currentUser.name} ovozli xabar yubordi`, '🎤 Ovozli xabar', 'chat', {type:'chat', id:currentUser.id}); try{ renderChatList(); }catch(e){} }
      };
      reader.readAsDataURL(blob);
    }
    voiceCancelled = false;
  };
  voiceCancelled = false;
  voiceRecorder.start();
  voiceStartTs = Date.now();
  document.getElementById('chatRecordingBar').classList.remove('hidden');
  document.getElementById('chatMicBtn').classList.add('recording');
  voiceTimerInt = setInterval(()=>{
    const s = Math.floor((Date.now()-voiceStartTs)/1000);
    document.getElementById('chatRecTime').textContent = Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  }, 250);
}

function cancelVoiceRecording(){
  voiceCancelled = true;
  if(voiceRecorder && voiceRecorder.state==='recording') voiceRecorder.stop();
}

async function startVoiceCall(){
  if(callId) return; // allaqachon qo'ng'iroqda
  const isAdmin = currentUser && currentUser.role==='admin';
  const targetId = isAdmin ? activeChatUserId : 'admin';
  const targetName = isAdmin ? (document.getElementById('chatTitle').textContent||'Mijoz') : "Ishlab chiqaruvchi";
  if(!targetId){ alert("Suhbatdosh tanlanmagan"); return; }
  if(!cloudOn()){ alert("Internet aloqasi yo'q — qo'ng'iroq qilib bo'lmaydi"); return; }

  callRole = 'caller'; callTargetId = targetId; callTargetName = targetName;
  document.getElementById('callAvatar').textContent = (targetName[0]||'?').toUpperCase();
  document.getElementById('callName').textContent = targetName;
  document.getElementById('callStatus').textContent = "Chaqirilmoqda...";
  document.getElementById('callTimer').classList.add('hidden');
  document.getElementById('callSecondaryRow').classList.add('hidden');
  document.getElementById('callAcceptBtn').classList.add('hidden');
  document.getElementById('callScreenBg').classList.add('open');

  try{
    callLocalStream = await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    alert("Mikrofonga ruxsat berilmadi");
    cleanupCall();
    return;
  }

  callPC = new RTCPeerConnection(ICE_SERVERS);
  callLocalStream.getTracks().forEach(t=>callPC.addTrack(t, callLocalStream));
  const remoteStream = new MediaStream();
  document.getElementById('callRemoteAudio').srcObject = remoteStream;
  callPC.ontrack = e=>{
    const audioEl = document.getElementById('callRemoteAudio');
    // Ba'zi brauzerlar (ayniqsa iOS Safari) stream'ga keyinchalik qo'shilgan
    // trackni "sezmasligi" mumkin — shuning uchun to'g'ridan-to'g'ri kelgan
    // stream'ni o'rnatib, aniq play() chaqiramiz (ovoz eshitilmasligining
    // eng ko'p uchraydigan sababi shu).
    if(audioEl.srcObject !== e.streams[0]) audioEl.srcObject = e.streams[0];
    audioEl.muted = false;
    audioEl.play().catch(()=>{});
  };

  const docRef = fsDb.collection('calls').doc();
  callId = docRef.id;
  const callerCandidates = [];

  callPC.onicecandidate = e=>{
    if(e.candidate) docRef.update({callerCandidates: firebase.firestore.FieldValue.arrayUnion(JSON.stringify(e.candidate))}).catch(()=>{});
  };

  const offer = await callPC.createOffer();
  await callPC.setLocalDescription(offer);

  try{
    await docRef.set({
      callerId: myCallId(), callerName: myCallName(),
      calleeId: targetId, calleeName: targetName,
      offer: {type:offer.type, sdp:offer.sdp},
      status:'ringing', createdAt: Date.now(),
      callerCandidates:[], calleeCandidates:[]
    });
  }catch(err){
    console.warn("Qo'ng'iroq yaratishda xato:", err);
    if(err && err.code==='permission-denied'){
      alert("Qo'ng'iroq funksiyasi ishlamayapti: Firebase xavfsizlik qoidalarida 'calls' to'plamiga ruxsat yo'q. Firebase Console → Firestore → Rules bo'limiga /calls/{document=**} uchun ruxsat qo'shing.");
    } else {
      alert("Qo'ng'iroqni boshlab bo'lmadi. Internetni tekshiring.");
    }
    cleanupCall();
    return;
  }

  let addedCalleeCandidates = new Set();
  let pendingCalleeCandidates = [];
  callUnsub = docRef.onSnapshot(async doc=>{
    const d = doc.data();
    if(!d) return;
    if(d.answer && callPC.signalingState==='have-local-offer'){
      await callPC.setRemoteDescription(new RTCSessionDescription(d.answer));
      document.getElementById('callStatus').textContent = "Ulandi";
      startCallTimer();
      document.getElementById('callSecondaryRow').classList.remove('hidden');
      document.getElementById('callRemoteAudio').play().catch(()=>{});
      // remote description endi tayyor — kutib turgan nomzodlarni qo'shamiz
      pendingCalleeCandidates.forEach(c=>{ try{ callPC.addIceCandidate(c); }catch(e){} });
      pendingCalleeCandidates = [];
    }
    (d.calleeCandidates||[]).forEach(cStr=>{
      if(addedCalleeCandidates.has(cStr)) return;
      addedCalleeCandidates.add(cStr);
      let cand; try{ cand = new RTCIceCandidate(JSON.parse(cStr)); }catch(e){ return; }
      if(callPC.remoteDescription){ try{ callPC.addIceCandidate(cand); }catch(e){} }
      else { pendingCalleeCandidates.push(cand); }
    });
    if(d.status==='declined'){ document.getElementById('callStatus').textContent = "Rad etildi"; setTimeout(cleanupCall, 1200); }
    if(d.status==='ended'){ cleanupCall(); }
  });
}

function locateMeOnPicker(){
  if(!navigator.geolocation){ alert('Qurilmangiz joylashuvni aniqlashni qo\'llab-quvvatlamaydi.'); return; }
  const btn = document.getElementById('homeLocMeBtn');
  btn.style.opacity='.6';
  navigator.geolocation.getCurrentPosition(pos=>{
    btn.style.opacity='';
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if(homeLocMap){ homeLocMap.setView(ll, 16); homeLocMarker.setLatLng(ll); }
  }, ()=>{
    btn.style.opacity='';
    alert("Joylashuv aniqlanmadi. Brauzerga joylashuv ruxsatini bering yoki xaritadan qo'lda tanlang.");
  }, {enableHighAccuracy:true, timeout:8000});
}

function openHomeLocationPicker(mode){
  locPickerMode = mode || 'home';
  if(locPickerMode==='register') closeModal('modalAuth');
  if(locPickerMode==='newstore') closeModal('modalAddStore');
  openModal('modalHomeLocation');
  document.getElementById('homeLocTitle').textContent = locPickerMode==='dokon' ? 'Do\'kon manzilini xaritadan tanlang' : (locPickerMode==='register' ? 'Turgan joyingizni xaritadan tanlang' : (locPickerMode==='newstore' ? 'Do\'kon manzilini xaritadan tanlang' : 'Uy manzilini xaritadan tanlang'));
  const u = currentUser ? state.users.find(x=>x.id===currentUser.id) : null;
  const nsLatVal = parseFloat((document.getElementById('nsLat')||{}).value);
  const nsLngVal = parseFloat((document.getElementById('nsLng')||{}).value);
  const startLat = (locPickerMode==='register' ? regPickLat : (locPickerMode==='newstore' ? (isFinite(nsLatVal)?nsLatVal:null) : orderLat)) || (u&&u.homeLat) || 41.3111;
  const startLng = (locPickerMode==='register' ? regPickLng : (locPickerMode==='newstore' ? (isFinite(nsLngVal)?nsLngVal:null) : orderLng)) || (u&&u.homeLng) || 69.2797;
  setTimeout(()=>{
    if(!homeLocMap){
      homeLocMap = L.map('homeLocMapWrap').setView([startLat,startLng], 14);
      mapTileLayer().addTo(homeLocMap);
      homeLocMarker = L.marker([startLat,startLng], {draggable:true}).addTo(homeLocMap);
      homeLocMap.on('click', e=>{ homeLocMarker.setLatLng(e.latlng); });
    } else {
      homeLocMap.invalidateSize();
      homeLocMap.setView([startLat,startLng], 14);
      homeLocMarker.setLatLng([startLat,startLng]);
    }
  }, 200);
}

function cancelHomeLocationPicker(){
  closeModal('modalHomeLocation');
  if(locPickerMode==='newstore'){ openModal('modalAddStore'); return; }
  openModal(locPickerMode==='register' ? 'modalAuth' : 'modalBasket');
}

async function confirmHomeLocationPicker(){
  const ll = homeLocMarker.getLatLng();
  if(locPickerMode==='register'){
    regPickLat = ll.lat; regPickLng = ll.lng;
    const st = document.getElementById('regLocStatus');
    st.style.display='block';
    st.innerHTML = `${ic('check',13)} Joylashuv tanlandi (${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)})`;
    closeModal('modalHomeLocation');
    openModal('modalAuth');
    return;
  }
  if(locPickerMode==='newstore'){
    document.getElementById('nsLat').value = ll.lat.toFixed(6);
    document.getElementById('nsLng').value = ll.lng.toFixed(6);
    document.getElementById('nsLocStatus').innerHTML = `${ic('check',13)} Manzil xaritadan tanlandi`;
    closeModal('modalHomeLocation');
    openModal('modalAddStore');
    return;
  }
  orderLat = ll.lat; orderLng = ll.lng;
  if(locPickerMode==='dokon'){
    document.getElementById('boLocStatus').innerHTML = `${ic('check',13)} Do'kon manzili xaritadan tanlandi`;
  } else {
    if(currentUser){
      const u = state.users.find(x=>x.id===currentUser.id);
      if(u){ u.homeLat = ll.lat; u.homeLng = ll.lng; await saveState(); }
    }
    document.getElementById('boPersonalLocStatus').innerHTML = `${ic('check',13)} Uy manzili tanlandi`;
  }
  closeModal('modalHomeLocation');
  openModal('modalBasket');
}
