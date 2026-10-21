/* Unutilmas Ta'm — 30-storelink.js
   ═══════════════════════════════════════════════════════════════
   MAGAZIN EGASI  <->  DO'KON KARTASI  BOG'LANISHI

   MUAMMO NIMA EDI:
   Magazin egasi ro'yxatdan o'tganda faqat "Foydalanuvchilar"
   ro'yxatiga tushardi. "Do'konlar" bo'limi va XARITA esa boshqa
   ro'yxatdan (state.stores) chiziladi — u yerda hech narsa
   yaratilmasdi. Natijada 29 ta egasi ro'yxatda bor, lekin
   xaritada bitta ham nuqta yo'q edi.

   Eski tuzatish (backfillApprovedStoreOwners) ilova ochilgandan
   keyin 3,2 soniyada BIR MARTA ishga tushardi. Bulutdagi
   foydalanuvchilar esa odatda undan KEYIN keladi — shuning uchun
   u deyarli har safar bo'sh ro'yxat ustida ishlab, hech narsa
   qilmasdan tugardi. Ustiga u faqat "tasdiqlangan" egalarni
   ko'rardi, "tasdiq kutayotgan"larni esa umuman o'tkazib yuborardi.

   ENDI QANDAY:
   • syncStoreOwners() HAR SAFAR bulutdan ma'lumot kelganda
     qayta ishlaydi — ma'lumot kech kelsa ham yetib boradi.
   • Tasdiqlangan ham, tasdiq kutayotgan ham do'kon kartasini oladi
     (tasdiq faqat ulgurji narxlarni ochadi, xaritada ko'rinishga
     aloqasi yo'q).
   • Bir xil telefon raqamli egasi va do'kon avtomatik bog'lanadi —
     xaritadan qo'shilgan do'kon ham, ro'yxatdan o'tgan egasi ham
     BITTA kartaga keladi.

   MUHIM: state.stores — "admin kaliti" (2-sync.js: ADMIN_KEYS).
   Oddiy foydalanuvchi uni bulutga yoza olmaydi (qoidalar rad etadi).
   Shuning uchun do'kon kartasini FAQAT admin qurilmasi yaratadi.
   Egasining o'zi esa kartani bulutdan tayyor holda oladi.

   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang.
   ═══════════════════════════════════════════════════════════════ */

/* ───────── Telefon raqamni solishtirish ─────────
   "+998 90 519 99 67", "998905199967", "90 519 99 67" — bularning
   hammasi BITTA raqam. Shuning uchun solishtirishdan oldin faqat
   raqamlarni qoldirib, oxirgi 9 ta raqamni olamiz (O'zbekiston
   raqamining o'zgarmas qismi). */
function phoneKey(v){
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if(d.length < 7) return '';            // raqam emas (masalan email)
  return d.slice(-9);
}

/* Email ham login bo'lishi mumkin — u holda raqam emas, matn solishtiriladi */
function contactKey(v){
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if(!s) return '';
  const p = phoneKey(s);
  return p ? ('t:' + p) : ('e:' + s);
}

/* Shu login (telefon/email) bilan allaqachon ro'yxatdan o'tgan odam.
   exceptId — tekshiruvdan chetlatiladigan foydalanuvchi (o'zini o'zi
   takror deb hisoblamasligi uchun). */
function findUserByContact(contact, exceptId){
  const k = contactKey(contact);
  if(!k) return null;
  return (state.users || []).find(function(u){
    if(!u || u.id === exceptId) return false;
    if(contactKey(u.contact) === k) return true;
    if(u.tgPhone && contactKey(u.tgPhone) === k) return true;
    return false;
  }) || null;
}

/* Shu raqam bilan ro'yxatdan o'tgan MAGAZIN EGASI */
function findStoreOwnerByContact(contact, exceptId){
  const u = findUserByContact(contact, exceptId);
  return (u && u.userType === 'store') ? u : null;
}

/* Shu raqamdagi do'kon kartasi */
function findStoreByPhone(phone, exceptId){
  const k = phoneKey(phone);
  if(!k) return null;
  return (state.stores || []).find(function(s){
    return s && s.id !== exceptId && phoneKey(s.phone) === k;
  }) || null;
}

/* Foydalanuvchiga bog'langan do'kon kartasi */
function storeOfOwner(userId){
  if(!userId) return null;
  return (state.stores || []).find(function(s){ return s && s.ownerUserId === userId; }) || null;
}

/* ───────── Do'kon kartasini yaratish yoki bog'lash ─────────
   Takroriy karta yaratmaydi:
     1) egaga allaqachon bog'langan karta bo'lsa — o'shani qaytaradi
     2) bog'lanmagan, lekin AYNAN SHU raqamli karta bo'lsa —
        (masalan admin uni xaritadan qo'lda qo'shgan) o'shani
        egaga bog'laydi
     3) aks holda yangi karta yaratadi
   Qaytaradi: { store, created, linked } */
function ensureStoreForOwner(u){
  if(!u || u.userType !== 'store') return { store: null, created: false, linked: false };
  state.stores = state.stores || [];

  const already = storeOfOwner(u.id);
  if(already) return { store: already, created: false, linked: false };

  /* Xaritadan qo'lda qo'shilgan, hali hech kimga bog'lanmagan karta */
  const orphan = (state.stores || []).find(function(s){
    return s && !s.ownerUserId && phoneKey(s.phone) && phoneKey(s.phone) === phoneKey(u.contact);
  });
  if(orphan){
    orphan.ownerUserId = u.id;
    if(!orphan.ownerName) orphan.ownerName = u.name || '';
    u.autoStoreCreated = true;
    return { store: orphan, created: false, linked: true };
  }

  const hasPin = typeof u.homeLat === 'number' && typeof u.homeLng === 'number';
  const s = {
    id: uid('s'),
    name: u.storeName || u.name || "Do'kon",
    ownerName: u.name || '',
    phone: u.contact || '',
    address: u.address || u.storeAddr || '',
    /* Ro'yxatdan o'tganda xaritada joy belgilagan bo'lsa — aynan o'sha
       nuqta. Bo'lmasa, admin keyin xaritadan aniqlashtirishi uchun
       markazga yaqin vaqtinchalik nuqta qo'yiladi. */
    lat: hasPin ? u.homeLat : (41.3111 + (Math.random() - 0.5) * 0.08),
    lng: hasPin ? u.homeLng : (69.2797 + (Math.random() - 0.5) * 0.08),
    ownerUserId: u.id,
    extraPhones: [],
    fromRegistration: true,
    needsLocation: !hasPin        // admin joyini aniqlashtirsin
  };
  state.stores.push(s);
  u.autoStoreCreated = true;
  return { store: s, created: true, linked: false };
}

/* ───────── Takroriy kartalarni birlashtirish ─────────
   Bir egaga bir nechta karta tushib qolgan bo'lsa (bir vaqtda bir
   necha qurilma tuzatish ishlatganda shunday bo'lgan), tarixi
   ko'proq bo'lganini qoldirib, qolganini unga ko'chiradi. */
function mergeDuplicateStores(){
  const byOwner = {};
  (state.stores || []).forEach(function(s){
    if(!s || !s.ownerUserId) return;
    (byOwner[s.ownerUserId] = byOwner[s.ownerUserId] || []).push(s);
  });

  const drop = new Set();
  function score(s){
    const o = (state.orders   || []).filter(function(x){ return x.storeId === s.id; }).length;
    const l = (state.ledger   || []).filter(function(x){ return x.partyType === 'store' && x.partyId === s.id; }).length;
    const r = (state.receipts || []).filter(function(x){ return x.storeId === s.id; }).length;
    return o + l + r;
  }

  Object.keys(byOwner).forEach(function(ownerId){
    const group = byOwner[ownerId];
    if(group.length < 2) return;
    const sorted = group.slice().sort(function(a, b){ return score(b) - score(a); });
    const keep = sorted[0];
    sorted.slice(1).forEach(function(dup){
      (state.orders   || []).forEach(function(o){ if(o.storeId === dup.id) o.storeId = keep.id; });
      (state.ledger   || []).forEach(function(l){ if(l.partyType === 'store' && l.partyId === dup.id) l.partyId = keep.id; });
      (state.receipts || []).forEach(function(r){ if(r.storeId === dup.id) r.storeId = keep.id; });
      (state.sales    || []).forEach(function(x){ if(x.storeId === dup.id) x.storeId = keep.id; });
      /* Yo'qolib ketmasin: saqlanadigan kartada bo'sh bo'lgan ma'lumotni olamiz */
      if(!keep.phone   && dup.phone)   keep.phone   = dup.phone;
      if(!keep.address && dup.address) keep.address = dup.address;
      if(keep.needsLocation && !dup.needsLocation){ keep.lat = dup.lat; keep.lng = dup.lng; keep.needsLocation = false; }
      drop.add(dup.id);
    });
  });

  if(!drop.size) return 0;
  state.stores = (state.stores || []).filter(function(s){ return !drop.has(s.id); });
  return drop.size;
}

/* ───────── ASOSIY: hamma magazin egasini do'konlar bilan bog'laydi ─────────
   Ilova ochilganda va bulutdan HAR SAFAR ma'lumot kelganda ishlaydi.
   Hech narsa o'zgarmasa — hech narsa saqlamaydi (bulutga ortiqcha
   yozuv ketmasligi uchun). */
let __storeLinkBusy = false;

async function syncStoreOwners(){
  /* state.stores — admin kaliti; faqat admin qurilmasi uni bulutga
     yoza oladi. Boshqa qurilmada yaratsak, u bulutga chiqmaydi va
     keyin takroriy karta bo'lib qoladi. */
  if(!currentUser || currentUser.role !== 'admin') return 0;
  if(__storeLinkBusy) return 0;
  __storeLinkBusy = true;
  try{
    state.stores = state.stores || [];
    let created = 0, linked = 0;

    const owners = (state.users || []).filter(function(u){ return u && u.userType === 'store'; });
    owners.forEach(function(u){
      /* Rad etilgan egaga do'kon kartasi ochilmaydi */
      if(u.storeStatus === 'rejected') return;
      const r = ensureStoreForOwner(u);
      if(r.created) created++;
      if(r.linked)  linked++;
    });

    /* Egasi o'z ma'lumotini o'zgartirgan bo'lsa (ism, magazin nomi,
       manzil, joylashuv), avtomatik yaratilgan kartani yangilab
       turamiz. Admin qo'lda tahrirlagan kartaga TEGMAYMIZ. */
    let refreshed = 0;
    (state.stores || []).forEach(function(s){
      if(!s || !s.fromRegistration || !s.ownerUserId) return;
      const u = (state.users || []).find(function(x){ return x.id === s.ownerUserId; });
      if(!u) return;
      const wantName  = u.storeName || u.name || s.name;
      const wantOwner = u.name || s.ownerName;
      const wantPhone = u.contact || s.phone;
      if(s.name !== wantName)           { s.name = wantName;           refreshed++; }
      if(s.ownerName !== wantOwner)     { s.ownerName = wantOwner;     refreshed++; }
      if(s.phone !== wantPhone)         { s.phone = wantPhone;         refreshed++; }
      /* Joylashuvni faqat hali aniqlanmagan bo'lsa qo'yamiz —
         admin xaritada surgan nuqtani bosib ketmasligi uchun */
      if(s.needsLocation && typeof u.homeLat === 'number' && typeof u.homeLng === 'number'){
        s.lat = u.homeLat; s.lng = u.homeLng; s.needsLocation = false; refreshed++;
      }
    });

    const merged = mergeDuplicateStores();
    const changed = created + linked + refreshed + merged;
    if(!changed) return 0;

    await saveState();
    /* Xarita va ro'yxatni faqat o'sha bo'lim OCHIQ bo'lsa qayta chizamiz —
       yopiq bo'lsa xarita o'lchamini noto'g'ri hisoblab qolishi mumkin.
       Bo'limga kirilganda u o'zi qaytadan chiziladi. */
    try{
      const v = document.getElementById('v-stores');
      if(typeof renderStores === 'function' && v && v.classList.contains('active')) renderStores();
    }catch(e){}
    console.warn("Do'konlar bog'landi — yangi:", created, '| bog'+"'"+'landi:', linked,
                 '| yangilandi:', refreshed, '| birlashtirildi:', merged);
    return changed;
  }catch(e){
    console.warn("Do'kon bog'lashda xato:", e);
    return 0;
  }finally{
    __storeLinkBusy = false;
  }
}

/* Bulutdan ma'lumot kelganda juda tez-tez chaqirilmasin —
   oxirgi xabardan keyin 1,2 soniya kutib, bir marta ishlaydi. */
let __storeLinkTimer = null;
function scheduleStoreOwnerSync(delay){
  clearTimeout(__storeLinkTimer);
  __storeLinkTimer = setTimeout(function(){ syncStoreOwners(); }, delay || 1200);
}

/* ───────── Eski nomlar bilan moslik ─────────
   13-admin.js va boshqa joylarda eski nomlar chaqirilgan bo'lishi
   mumkin — ular endi shu yangi funksiyaga olib keladi. */
async function backfillApprovedStoreOwners(){ return syncStoreOwners(); }
async function dedupeStoresByOwner(){
  if(!currentUser || currentUser.role !== 'admin') return;
  const n = mergeDuplicateStores();
  if(!n) return;
  await saveState();
  try{ renderStores(); }catch(e){}
}
