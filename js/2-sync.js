/* Unutilmas Ta'm — 2-sync
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function seedState(){
  return {
    products: [
      {id:'p1', name:'Manti', gram:500, price:35000, stock:24, image:null, category:'gosht', description:'Uy sharoitida tayyorlangan, mol go\'shtli an\'anaviy manti.'},
      {id:'p2', name:'Tiftel', gram:400, price:28000, stock:18, image:null, category:'gosht', description:'Yumshoq va mazali go\'sht kotletlari, sousga tayyor.'},
      {id:'p3', name:'Lavash bazasi', gram:300, price:15000, stock:0, image:null, category:'xamir', description:'Yumshoq, yupqa lavash uchun tayyor baza.'},
    ],
    stores: [],
    users: [],
    orders: [],
    ledger: [],
    sales: [],
    notifications: [],
    chats: [],
    categories: INITIAL_CATEGORIES.map(c=>({...c})),
    sellerInfo: {
      telegram:'', instagram:'', channel:'', youtube:'', phone:'', address:'', installUrl:'', apkUrl:'', androidBtnHide:false, heroEyebrow:'', heroTitle:'', devBtnHide:false, devBtnText:'', about:'Unutilmas Ta\'m — har kuni yangi tayyorlangan milliy taomlar ishlab chiqarish sexi.'
    },
    adminSettings: { code: 'TAM-2026', phone:'', email:'' }
  };
}

function saveKeyTimes(){ try{ localStorage.setItem('utam_tmap', JSON.stringify(keyTimes)); }catch(e){} }

function saveDirty(){ try{ localStorage.setItem('utam_dirty', JSON.stringify(dirtyKeys)); }catch(e){} }

function cloudOn(){ return !!fsDb; }

function normalizeState(){
  if(!state.sales) state.sales = [];
  if(!state.receipts) state.receipts = [];
  if(!state.payRequests) state.payRequests = [];
  if(!state.rewards) state.rewards = {};
  if(!state.notifications) state.notifications = [];
  if(!state.chats) state.chats = [];
  if(!state.sellerInfo) state.sellerInfo = seedState().sellerInfo;
  if(!state.adminSettings) state.adminSettings = seedState().adminSettings;
  if(!state.users) state.users = [];
  if(!state.categories || !state.categories.length) state.categories = INITIAL_CATEGORIES.map(c=>({...c}));
  if(!state.promoCodes) state.promoCodes = [];
  if(!state.expenses) state.expenses = [];
  if(!state.deliveryZones) state.deliveryZones = [];
  if(!state.couriers) state.couriers = [];
  if(!Array.isArray(state.returns)) state.returns = [];
  (state.users||[]).forEach(u=>{
    if(!u.userType) u.userType = 'customer';
    if(typeof u.points!=='number') u.points = 0;
    /* Yangilanishdan OLDIN ro'yxatdan o'tgan magazin egalari tasdiqlangan
       hisoblanadi — aks holda ular to'satdan ilovadan chiqib qolardi. */
    if(u.userType==='store' && !u.storeStatus) u.storeStatus = 'approved';
  });
  (state.products||[]).forEach(p=>{ if(!p.category) p.category = 'pishiriq'; });
  sanitizeState();          // eski saqlangan xavfli ma'lumot ham tozalanadi
}

function seedLocalHashes(){
  /* Ilova ochilganda har bir kalitning joriy holatini "lokal o'zgarish keshi"ga
     yozib qo'yamiz. Shusiz birinchi saveState() HAMMA kalitni "o'zgargan" deb
     bulutga yuborardi — bu boshqa qurilmada qo'shilgan ma'lumotni (do'konlar,
     buyurtmalar) eski nusxa bilan o'chirib yuborishi mumkin edi. */
  try{
    Object.keys(state).forEach(key=>{ fsHashes['L:'+key] = JSON.stringify(state[key]); });
  }catch(e){}
}

function localLoad(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ state = JSON.parse(raw); normalizeState(); seedLocalHashes(); return true; }
  }catch(e){}
  return false;
}

function localSave(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    // Xotira to'lib qolsa (masalan juda ko'p siqilmagan rasm), bu ENDI sezilmasdan
    // o'tmaydi — foydalanuvchiga bir marta ko'rsatiladi, chunki bu holatda o'zgarishlar
    // butunlay saqlanmay qolishi mumkin.
    console.error('Lokal saqlashda xato (xotira to\'lgan bo\'lishi mumkin):', e);
    if(!__quotaWarned){
      __quotaWarned = true;
      setTimeout(()=>alert("Diqqat: telefon xotirasi to'lib qoldi, so'nggi o'zgarish saqlanmagan bo'lishi mumkin. Rasmlar hajmini kamaytiring yoki eski mahsulotlarni tozalang."), 300);
    }
  }
}

/* Bulutdan kelgan hujjatni qabul qilish: faqat lokaldan YANGI bo'lsa */
function acceptCloudDoc(key, raw, t){
  if(fsHashes[key] === raw) return false;            // o'zimiz yozganmiz
  const localT = keyTimes[key] || 0;
  if((t||0) < localT){                                // bulut eskiroq — lokalni yuboramiz
    dirtyKeys[key] = true; saveDirty(); scheduleFlush(200);
    return false;
  }
  try{
    state[key] = JSON.parse(raw);
    sanitizeList(key, state[key]);        // boshqa qurilmadan kelgan ma'lumot ham tozalanadi
    fsHashes[key] = raw;
    /* MUHIM TUZATISH: bulutdan qabul qilingan qiymatni "lokal o'zgarish keshi"ga
       ham yozamiz. Aks holda keyingi saveState() bu kalitni "men o'zgartirdim"
       deb hisoblab, ESKI mahalliy nusxani yangi vaqt bilan bulutga qayta yozib
       yuborardi. Aynan shu sabab: bir mijoz do'kon qo'shsa, admin boshqa narsani
       (masalan buyurtmani) o'chirganda o'sha do'kon YO'QOLIB ketardi. */
    fsHashes['L:'+key] = raw;
    keyTimes[key] = t||Date.now(); saveKeyTimes();
    return true;
  }catch(e){ return false; }
}

function scheduleFlush(delay){
  if(!cloudOn()) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushCloud, delay==null?600:delay);
}

/* ═══════════════════════════════════════════════════════════════
   BO'LAKLAB SAQLASH — Firestore'ning 1 MB chegarasidan himoya

   Firestore'da bitta hujjat 1 MiB dan oshmasligi kerak. Oshsa yozish
   rad etiladi va ma'lumot bulutga yetib bormaydi. Mahsulotlar
   (base64 rasmlar bilan) va sotuvlar tarixi bu chegaraga yetishi mumkin.

   Kichik bo'lim  -> app/<key>            {v, t}        (eski format)
   Katta bo'lim   -> app/<key>            {c: N, t}     (meta)
                     app/<key>__p0..N-1   {v: qism, t}

   300 000 belgi: kirill harfi UTF-8 da 2 bayt — eng yomon holda
   600 KB, chegaradan ancha past.
   ═══════════════════════════════════════════════════════════════ */
const CHUNK_CHARS = 300000;
const PART_SEP = '__p';

/* Faqat admin yozadigan bo'limlar — firestore.rules bilan BIR XIL bo'lishi shart */
const ADMIN_KEYS = ['products', 'stores', 'categories', 'deliveryZones', 'sales', 'ledger',
  'receipts', 'returns', 'expenses', 'adminSettings', 'sellerInfo'];

async function flushCloud(){
  if(!cloudOn() || flushing) return;
  const keys = Object.keys(dirtyKeys);
  if(!keys.length) return;
  flushing = true;
  try{
    /* Ikki alohida paket: biri rad etilsa (masalan admin kirmagan),
       ikkinchisi baribir saqlanadi — mijoz buyurtmasi yo'qolmaydi */
    const small = fsDb.batch(), adminBatch = fsDb.batch();
    let smallCount = 0, adminCount = 0;
    const sent = [], sentAdmin = [];
    const iAmAdmin = !!(currentUser && currentUser.role === 'admin');

    for(const key of keys){
      if(!(key in state)) { delete dirtyKeys[key]; continue; }
      const isAdminKey = ADMIN_KEYS.indexOf(key) !== -1;
      /* oddiy foydalanuvchi admin bo'limini yozmaydi (qoidalar rad etadi) */
      if(isAdminKey && !iAmAdmin){ delete dirtyKeys[key]; continue; }
      const raw = JSON.stringify(state[key]);
      const t = keyTimes[key] || Date.now();

      if(raw.length <= CHUNK_CHARS){
        if(isAdminKey){ adminBatch.set(fsDb.collection('app').doc(key), {v: raw, t}); adminCount++; sentAdmin.push([key, raw]); continue; }
        small.set(fsDb.collection('app').doc(key), {v: raw, t});
        smallCount++;
      }else{
        /* Katta bo'lim — alohida batch'da, atomik yoziladi */
        const n = Math.ceil(raw.length / CHUNK_CHARS);
        const b = fsDb.batch();
        for(let i = 0; i < n; i++){
          b.set(fsDb.collection('app').doc(key + PART_SEP + i),
                {v: raw.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS), t});
        }
        b.set(fsDb.collection('app').doc(key), {c: n, t, len: raw.length});
        try{
          await b.commit();
        }catch(e){
          /* rad etilsa sikl TO'XTAMAYDI — boshqa bo'limlar saqlanishi kerak */
          if(e && e.code === 'permission-denied' && typeof fbWarnAdminDenied === 'function') fbWarnAdminDenied();
          console.warn('Katta bo\'lim yuborilmadi:', key, e && e.code || e);
          continue;
        }
      }
      sent.push([key, raw]);
    }

    if(smallCount) await small.commit();
    if(adminCount){
      try{
        await adminBatch.commit();
        sent.push.apply(sent, sentAdmin);
      }catch(e){
        /* rad etildi — bo'limlar "yuborilmagan" bo'lib qoladi, keyin qayta urinamiz */
        if(e && e.code === 'permission-denied' && typeof fbWarnAdminDenied === 'function') fbWarnAdminDenied();
        console.warn('Admin bo\'limlari yuborilmadi:', e && e.code || e);
        scheduleFlush(15000);
      }
    }
    if(sent.length){
      sent.forEach(([key, raw])=>{
        fsHashes[key] = raw;
        delete dirtyKeys[key];
      });
      saveDirty();
    }
  }catch(e){
    console.warn('Bulutga yuborish kechikdi, qayta urinamiz:', e && e.code || e);
    scheduleFlush(8000); // qayta urinish
  }finally{
    flushing = false;
    if(Object.keys(dirtyKeys).length) scheduleFlush(8000);
  }
}

async function saveState(){
  sanitizeState();          // xavfsizlik: foydalanuvchi matnini tozalash
  // BIR ZUMDA: lokalga yozamiz, kalit vaqtlarini yangilaymiz
  const now = Date.now();
  Object.keys(state).forEach(key=>{
    const raw = JSON.stringify(state[key]);
    if(fsHashes['L:'+key] === raw) return;   // lokal o'zgarish aniqlash keshi
    fsHashes['L:'+key] = raw;
    keyTimes[key] = now;
    dirtyKeys[key] = true;
  });
  saveKeyTimes(); saveDirty();
  localSave();
  // Bulutga — fonda, UI'ni bloklamasdan
  scheduleFlush(400);
}


/* ═══ Bo'laklarni yig'ish (o'qish tomoni) ═══ */
const __parts = {};      // key -> { i: {v, t} }
const __metas = {};      // key -> {c, t}

/* Listener'dan kelgan har bir hujjat shu yerdan o'tadi.
   true qaytarsa — holat o'zgardi. */
function acceptCloudRaw(id, d){
  const sep = id.indexOf(PART_SEP);
  if(sep !== -1){
    const key = id.slice(0, sep);
    const i = parseInt(id.slice(sep + PART_SEP.length), 10);
    if(isNaN(i)) return false;
    (__parts[key] = __parts[key] || {})[i] = {v: d.v, t: d.t};
    return tryAssemble(key);
  }
  if(d && typeof d.c === 'number'){
    __metas[id] = {c: d.c, t: d.t};
    return tryAssemble(id);
  }
  if(d && typeof d.v === 'string'){
    delete __metas[id];
    return acceptCloudDoc(id, d.v, d.t);
  }
  return false;
}

function tryAssemble(key){
  const m = __metas[key];
  const ps = __parts[key];
  if(!m || !ps) return false;
  const pieces = [];
  for(let i = 0; i < m.c; i++){
    const p = ps[i];
    /* Barcha bo'laklar aynan shu yozuvga tegishli bo'lishi shart */
    if(!p || p.t !== m.t) return false;
    pieces.push(p.v);
  }
  return acceptCloudDoc(key, pieces.join(''), m.t);
}

/* Bo'limlar hajmi — admin uchun ko'rsatkich */
function stateSizeReport(){
  return Object.keys(state).map(function(k){
    const len = JSON.stringify(state[k]).length;
    return { key: k, len: len, parts: Math.max(1, Math.ceil(len / CHUNK_CHARS)) };
  }).sort(function(a,b){ return b.len - a.len; });
}


/* ═══════════════════════════════════════════════════════════════
   XAVFSIZLIK: foydalanuvchi matnini tozalash

   Magazin egalari va mijozlar o'zlari ro'yxatdan o'tadi va nomini
   o'zlari yozadi. Bu nomlar ekranga innerHTML orqali chiqadi. Agar
   kimdir nom o'rniga <img src=x onerror=...> yozsa, bu kod ADMIN
   panelida ishga tushib, butun bazani o'zgartirishi mumkin edi.

   Yechim: ma'lumot SAQLANISHIDA va BULUTDAN KELISHIDA tozalanadi —
   bitta joyda, butun ilovani qamraydi.
     <  >  -> olib tashlanadi   (teg kiritib bo'lmaydi)
     "     -> ”                 (atribut ichidan chiqib bo'lmaydi)
   Apostrof (') saqlanadi — O'zbek, Ta'm kabi nomlar buzilmaydi.
   ═══════════════════════════════════════════════════════════════ */
function cleanText(v){
  if(typeof v !== 'string') return v;
  if(v.indexOf('<') === -1 && v.indexOf('>') === -1 && v.indexOf('"') === -1) return v;
  return v.replace(/[<>]/g, '').replace(/"/g, '\u201D');
}

/* HTML ichiga xavfsiz qo'yish uchun (yangi kodda ishlatiladi) */
function esc(v){
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const TEXT_FIELDS = {
  stores:   ['name', 'ownerName', 'address', 'phone'],
  users:    ['name', 'storeName', 'storeAddr', 'address', 'contact'],
  products: ['name', 'desc', 'description', 'preorderNote'],
  ledger:   ['partyName', 'note'],
  receipts: ['storeName', 'no'],
  payRequests: ['partyName', 'note', 'userName'],
  sales:    ['productName', 'storeName'],
  returns:  ['productName', 'reason'],
  orders:   ['customerName', 'customerPhone', 'address', 'comment', 'storeName', 'note', 'returnReason'],
  couriers: ['name', 'phone']
};

function sanitizeList(key, arr){
  const fields = TEXT_FIELDS[key];
  if(!fields || !Array.isArray(arr)) return;
  for(let i = 0; i < arr.length; i++){
    const o = arr[i];
    if(!o || typeof o !== 'object') continue;
    for(let f = 0; f < fields.length; f++){
      const k = fields[f];
      if(typeof o[k] === 'string') o[k] = cleanText(o[k]);
    }
    /* buyurtma va qarzdagi mahsulot nomlari */
    if(Array.isArray(o.items)){
      o.items.forEach(function(it){ if(it && typeof it.name === 'string') it.name = cleanText(it.name); });
    }
  }
}

function sanitizeState(){
  try{
    Object.keys(TEXT_FIELDS).forEach(function(k){ sanitizeList(k, state[k]); });
  }catch(e){ console.warn('sanitize:', e); }
}
