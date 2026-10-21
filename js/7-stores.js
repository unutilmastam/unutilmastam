/* Unutilmas Ta'm — 7-stores
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

/* Magazin egasi, lekin hali tasdiqlanmagan */
function isPendingStore(){
  if(!currentUser || currentUser.role === 'admin') return false;
  const u = currentUserRecord();
  if(!u || u.userType !== 'store') return false;
  return u.storeStatus !== 'approved';
}

/* Rad etilganmi (admin rad etgan) */
function isRejectedStore(){
  const u = currentUserRecord();
  return !!(u && u.userType === 'store' && u.storeStatus === 'rejected');
}

/* Magazin egasi ro'yxatdan o'tganda adminга Telegram orqali xabar beradi.
   Iste'molchi ro'yxatdan o'tganda hech narsa yubormaydi. */
function notifyNewStoreOwner(u){
  if(!u || u.userType !== 'store') return;
  const msg =
    "\ud83c\udfea <b>Yangi magazin egasi so'rovi</b>\n\n" +
    "Ism: " + (u.name||'-') + "\n" +
    "Magazin: " + (u.storeName||'-') + "\n" +
    "Manzil: " + (u.address||'-') + "\n" +
    "Aloqa: " + (u.contact||'-') + "\n\n" +
    "Tasdiqlash uchun: ilova \u2192 Foydalanuvchilar \u2192 Magazin egalari";
  notifyAdminViaBot(msg);
}

function enterPreviewMode(){
  if(!isPendingStore()) return;
  previewMode = true;
  document.body.classList.add('previewMode');
  document.getElementById('storePendingScreen').classList.add('hidden');
  document.getElementById('previewBar').classList.remove('hidden');
  showView('catalog');
}

function exitPreviewMode(){
  previewMode = false;
  document.body.classList.remove('previewMode');
  document.getElementById('previewBar').classList.add('hidden');
  refreshStoreGate();      // kutish ekrani qaytadi
}

/* ═══ MAGAZIN EGASI TASDIQLASH: ekran boshqaruvi ═══ */

/* Har renderShell'da chaqiriladi: tasdiqlanmagan magazin egasiga
   butun ilovani yopib, kutish ekranini ko'rsatadi. */
/* Tasdiqlash kutayotgan magazin egalari soni */
function pendingStoreCount(){
  return (state.users||[]).filter(u =>
    u.userType === 'store' && (u.storeStatus||'approved') === 'pending'
  ).length;
}

/* "Ro'yxatdan o'tganlar" kartochkasidagi qizil bildirishnoma.
   Admin tasdiqlagach yoki rad etgach o'zi yo'qoladi. */
function refreshPendingStoreBadge(){
  const el = document.getElementById('pendingStoreDot');
  if(!el) return;
  const n = pendingStoreCount();
  if(n > 0 && currentUser && currentUser.role === 'admin'){
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.remove('hidden');
  }else{
    el.classList.add('hidden');
  }
}

function refreshStoreGate(){
  const scr = document.getElementById('storePendingScreen');
  if(!scr) return;
  if(!isPendingStore()){
    scr.classList.add('hidden');
    if(previewMode) exitPreviewMode();   // tasdiqlangan bo'lsa preview'dan chiqamiz
    return;
  }
  if(previewMode){ scr.classList.add('hidden'); return; }   // tanishish rejimida ekran yopiq

  const rejected = isRejectedStore();
  const row = document.getElementById('spStatusRow');
  const box = document.getElementById('spIconBox');

  if(box) box.innerHTML = ic(rejected ? 'x' : 'store', 34);

  if(rejected){
    row.classList.add('rejected');
    document.getElementById('spStatusTxt').textContent = 'So\'rov qabul qilinmadi';
    document.getElementById('spTitle').textContent = 'So\'rov qabul qilinmadi';
    document.getElementById('spText').innerHTML =
      "Magazin egasi sifatidagi so'rovingiz tasdiqlanmadi.<br><br>" +
      "Agar bu xato deb hisoblasangiz, administrator bilan bog'laning.";
    document.getElementById('spNote').textContent =
      "Iste'molchi sifatida foydalanish uchun yangi hisob ochishingiz mumkin.";
  }else{
    row.classList.remove('rejected');
    document.getElementById('spStatusTxt').textContent = 'Tasdiqlash kutilmoqda';
  }
  scr.classList.remove('hidden');
}

async function rejectStoreUser(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u) return;
  if(!confirm(`"${u.name}" so'rovi rad etilsinmi?\n\nU magazin narxlarini ko'ra olmaydi.`)) return;
  u.storeStatus = 'rejected';
  await saveState();
  pushNotification(u.id, 'So\'rov qabul qilinmadi',
    'Magazin egasi sifatidagi so\'rovingiz tasdiqlanmadi. Batafsil ma\'lumot uchun administrator bilan bog\'laning.', 'system');
  refreshPendingStoreBadge();
  openUsersModal();
}

/* Rad etilganni qayta tasdiqlash uchun — kutish holatiga qaytarish */
async function resetStoreUser(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u) return;
  u.storeStatus = 'pending';
  await saveState();
  refreshPendingStoreBadge();
  openUsersModal();
}

/* ==================== DASHBOARD ==================== */
function computeStoreDebt(storeId){
  return state.ledger.filter(l=>l.partyType==='store' && l.partyId===storeId).reduce((s,l)=>s+l.debt,0);
}

function renderScanStoreOptions(){ renderScanSession(); }

/* Xaritadagi belgi bosilganda chaqiriladi (HTML onclick orqali) */
function __storePinClick(storeId){
  const s = (state.stores||[]).find(x=>x.id===storeId);
  if(!s){ console.warn('Do\'kon topilmadi:', storeId); return; }
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){}
  openStoreDetail(storeId);
}

function plotStoresOnMap(mapInstance, markersRef, onStoreClick){
  markersRef.forEach(m=>mapInstance.removeLayer(m));
  markersRef.length = 0;
  state.stores.forEach(s=>{
    const color = storeStatusColor(s.id);
    const marker = L.marker([s.lat,s.lng], {
      icon: pinDivIcon(color),
      onClickJs: `__storePinClick('${s.id}')`
    }).addTo(mapInstance);
    marker.bindTooltip(s.name, {permanent:true, direction:'top', offset:[0,-32], className:'mapNameLabel'});
    marker.on('click', (e)=>{ L.DomEvent.stopPropagation(e); onStoreClick(s.id); });
    markersRef.push(marker);
  });
}

let nsExtraPhones = [];

function renderNsExtraPhones(){
  const box = document.getElementById('nsExtraPhonesList');
  if(!box) return;
  box.innerHTML = nsExtraPhones.map((ph, i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <input value="${(ph||'').replace(/"/g,'&quot;')}" placeholder="+998 90 000 00 00" autocomplete="off"
             oninput="nsExtraPhones[${i}]=this.value" style="flex:1;">
      <button type="button" class="tinyIconBtn danger" style="flex-shrink:0;" onclick="removeNsExtraPhone(${i})">${ic('trash',14)}</button>
    </div>`).join('');
}
function addNsExtraPhone(){
  nsExtraPhones.push('');
  renderNsExtraPhones();
  const box = document.getElementById('nsExtraPhonesList');
  const last = box && box.querySelector('input:last-of-type');
  if(last) last.focus();
}
function removeNsExtraPhone(i){
  nsExtraPhones.splice(i, 1);
  renderNsExtraPhones();
}

function openStoreModal(storeId){
  editingStoreId = storeId;
  document.getElementById('nsLocStatus').textContent = '';
  if(storeId){
    const s = state.stores.find(x=>x.id===storeId);
    document.getElementById('storeModalTitle').textContent = 'Do\'konni tahrirlash';
    document.getElementById('nsOwnerPickWrap').classList.add('hidden');
    document.getElementById('nsName').value = s.name;
    document.getElementById('nsOwnerName').value = s.ownerName||'';
    document.getElementById('nsPhone').value = s.phone||'';
    document.getElementById('nsAddr').value = s.address||'';
    document.getElementById('nsLat').value = s.lat;
    document.getElementById('nsLng').value = s.lng;
    nsExtraPhones = (s.extraPhones||[]).slice();
    document.getElementById('storeSaveBtn').textContent = 'O\'zgarishlarni saqlash';
    document.getElementById('storeDeleteBtn').classList.remove('hidden');
  } else {
    document.getElementById('storeModalTitle').textContent = 'Yangi do\'kon';
    ['nsName','nsOwnerName','nsPhone','nsAddr','nsLat','nsLng'].forEach(id=>document.getElementById(id).value='');
    nsExtraPhones = [];
    document.getElementById('storeSaveBtn').textContent = 'Do\'konni saqlash';
    document.getElementById('storeDeleteBtn').classList.add('hidden');
    document.getElementById('nsOwnerPickWrap').classList.remove('hidden');
    const sel = document.getElementById('nsOwnerPick');
    const unlinked = state.users.filter(u=>u.userType==='store' && !state.stores.some(s2=>s2.ownerUserId===u.id));
    sel.innerHTML = `<option value="">— Yangi do'kon (ro'yxatdan o'tmagan) —</option>` +
      unlinked.map(u=>`<option value="${u.id}">${u.name} — ${u.storeName||'nomsiz'}</option>`).join('');
  }
  renderNsExtraPhones();
  openModal('modalAddStore');
}

function renderStores(){
  renderDebtsAdmin();
  const list = document.getElementById('storeList');
  /* Ixcham ro'yxat — bitta qator: nom, egasi, qarz yoki holat.
     Bosilganda to'liq ma'lumot oynasi ochiladi. */
  const cnt = document.getElementById('storeListCount');
  if(cnt) cnt.textContent = state.stores.length;
  list.innerHTML = state.stores.slice().sort(function(a, b){
      return (typeof storeDebt === 'function' ? storeDebt(b.id) - storeDebt(a.id) : 0) ||
             String(a.name || '').localeCompare(String(b.name || ''));
    }).map(function(s){
    const debt = (typeof storeDebt === 'function') ? storeDebt(s.id) : 0;
    const bn = (typeof bonusState === 'function') ? bonusState(s.id) : null;
    return `<button class="slRow" data-q="${String((s.name||'') + ' ' + (s.ownerName||'')).toLowerCase()}"
                    onclick="openStoreDetail('${s.id}')">
      <span class="slDot" style="background:${storeStatusColor(s.id)}"></span>
      <span class="slMain">
        <span class="slName">${s.name}${bn && bn.reached ? ' <i class="slBonus">🎁</i>' : ''}</span>
        <span class="slMeta">${[s.ownerName, s.phone].filter(Boolean).join(' · ') || (s.address || '')}</span>
      </span>
      <span class="slRight ${debt > 0 ? 'debt' : ''}">${debt > 0 ? '−' + fmt(debt) : ''}</span>
    </button>`;
  }).join('') || emptyHtml('store',"Do'kon qo'shilmagan");
  if(!leafletMap){
    leafletMap = L.map('mapWrap').setView([41.3111,69.2797], 11);
    mapTileLayer().addTo(leafletMap);
    leafletMap.on('click', (e)=>{ openNewStoreAtLocation(e.latlng.lat, e.latlng.lng); });
    centerMapOnMyLocation(leafletMap); // Toshkentdan — haqiqiy joyingizga
  }
  plotStoresOnMap(leafletMap, mapMarkers, openStoreDetail);
  plotOrderPinsOnMap(leafletMap, orderMapMarkers);
  syncMapTypeUI();
}

async function saveStore(){
  const name = document.getElementById('nsName').value.trim();
  const ownerName = document.getElementById('nsOwnerName').value.trim();
  const phone = document.getElementById('nsPhone').value.trim();
  const address = document.getElementById('nsAddr').value.trim();
  const lat = parseFloat(document.getElementById('nsLat').value) || (41.3111+(Math.random()-0.5)*0.08);
  const lng = parseFloat(document.getElementById('nsLng').value) || (69.2797+(Math.random()-0.5)*0.08);
  if(!name){ alert('Nomini kiriting'); return; }
  const extraPhones = nsExtraPhones.map(p=>(p||'').trim()).filter(Boolean);
  if(editingStoreId){
    const s = state.stores.find(x=>x.id===editingStoreId);
    /* Shu raqam boshqa do'konda ishlatilayotgan bo'lmasin */
    if(typeof findStoreByPhone === 'function' && phone){
      const other = findStoreByPhone(phone, editingStoreId);
      if(other){ alert("Bu raqam allaqachon \""+other.name+"\" do'koniga biriktirilgan.\n\nBitta raqam — bitta do'kon."); return; }
    }
    s.name=name; s.ownerName=ownerName; s.phone=phone; s.address=address; s.lat=lat; s.lng=lng;
    s.extraPhones=extraPhones;
    /* Qo'lda kiritilgan raqam ro'yxatdan o'tgan egaga tegishli bo'lsa — bog'laymiz */
    if(!s.ownerUserId && typeof findStoreOwnerByContact === 'function'){
      const owner = findStoreOwnerByContact(phone);
      if(owner){ s.ownerUserId = owner.id; owner.autoStoreCreated = true; }
    }
  } else {
    /* BITTA RAQAM — BITTA DO'KON.
       Shu raqam bilan do'kon yoki ro'yxatdan o'tgan magazin egasi
       allaqachon bo'lsa, ikkinchi kartani OCHMAYMIZ — mavjudini
       ochamiz. Shunday qilib "xaritadan qo'shish" va "ro'yxatdan
       o'tish" bitta kartaga kelib qo'shiladi. */
    if(phone && typeof findStoreByPhone === 'function'){
      const exists = findStoreByPhone(phone);
      if(exists){
        alert("Bu raqamdagi do'kon allaqachon bor: \""+exists.name+"\".\n\nIkkinchi marta ochilmaydi — mavjud do'kon ochiladi.");
        closeModal('modalAddStore');
        renderStores();
        try{ openStoreDetail(exists.id); }catch(e){}
        return;
      }
    }
    let ownerUserId = (document.getElementById('nsOwnerPick')||{}).value || null;
    if(!ownerUserId && phone && typeof findStoreOwnerByContact === 'function'){
      const owner = findStoreOwnerByContact(phone);
      if(owner) ownerUserId = owner.id;
    }
    if(ownerUserId){
      /* Egaga karta allaqachon bog'langan bo'lsa — o'shani ochamiz */
      const linked = (typeof storeOfOwner === 'function') ? storeOfOwner(ownerUserId) : null;
      if(linked){
        alert("Bu magazin egasining do'koni allaqachon bor: \""+linked.name+"\".");
        closeModal('modalAddStore');
        renderStores();
        try{ openStoreDetail(linked.id); }catch(e){}
        return;
      }
      const ou = state.users.find(x=>x.id===ownerUserId);
      if(ou) ou.autoStoreCreated = true;
    }
    state.stores.push({id:uid('s'), name, ownerName, phone, address, lat, lng, ownerUserId, extraPhones});
  }
  await saveState();
  closeModal('modalAddStore');
  renderStores();
}

async function deleteStore(){
  if(!editingStoreId) return;
  if(!confirm('Bu do\'konni o\'chirmoqchimisiz? Qarz tarixi ham o\'chadi.')) return;
  state.stores = state.stores.filter(x=>x.id!==editingStoreId);
  state.ledger = state.ledger.filter(l=>!(l.partyType==='store' && l.partyId===editingStoreId));
  await saveState();
  closeModal('modalAddStore');
  renderStores();
}

function storeStatusColor(storeId){
  if(computeStoreDebt(storeId)>0) return '#C9454E';
  if(storeHasPendingOrder(storeId)) return '#CB9D4D';
  return '#547EA0';
}

function storeStatusBadgeHtml(storeId){
  const debt = computeStoreDebt(storeId);
  if(debt>0) return `<span class="badge red">${fmt(debt)} so'm qarz</span>`;
  if(storeHasPendingOrder(storeId)) return `<span class="badge amber">Buyurtma bor</span>`;
  return `<span class="badge blue">Qarzi yo'q</span>`;
}

 // ro'yxatdan o'tgan do'kon egasi tanlansa, shu yerda saqlanadi

function openStoreDetail(storeId){
  sdStoreId = storeId; sdLatLng = null; sdTab = null; sdDraft = {}; sdPickerOpen = false; sdSelectedOwnerUserId = null;
  const s = state.stores.find(x=>x.id===storeId);
  document.getElementById('storeDetailTitle').textContent = s.name;
  renderStoreDetailShell(s, false);
  openModal('modalStoreDetail');
}

function openStoreDetailTab(storeId, tab){
  openStoreDetail(storeId);
  setSdTab(tab);
}

function openNewStoreAtLocation(lat,lng){
  if(!currentUser || currentUser.role!=='admin') return; // faqat sotuvchi/admin uchun
  sdStoreId = null; sdLatLng = {lat,lng}; sdTab = null; sdDraft = {}; sdPickerOpen = false; sdSelectedOwnerUserId = null;
  document.getElementById('storeDetailTitle').textContent = 'Yangi joylashuv';
  renderStoreDetailShell(null, true);
  openModal('modalStoreDetail');
  setSdTab('sotish');
}

function renderStoreDetailShell(s, isNew){
  const isAdmin = currentUser && currentUser.role==='admin';
  const debt = isNew ? 0 : computeStoreDebt(s.id);
  const items = isNew ? [] : state.ledger.filter(l=>l.partyType==='store' && l.partyId===s.id).reverse();
  const lat = isNew ? sdLatLng.lat : s.lat;
  const lng = isNew ? sdLatLng.lng : s.lng;
  const navName = isNew ? 'Yangi joylashuv' : s.name;

  /* Savdo tarixi va oylik hisob */
  const salesBlock = (!isNew && typeof storeSalesHtml === 'function')
    ? `<div class="card" style="margin-bottom:10px;">
         <div class="cardTitle">Savdo va qarzdorlik</div>
         ${storeSalesHtml(s.id)}
       </div>`
    : '';

  document.getElementById('storeDetailBody').innerHTML = `
    ${!isNew?`
    <div class="card" style="margin-bottom:10px;">
      <div class="row" style="align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:800;font-size:15px;margin-bottom:6px;">${s.name}</div>
          ${s.ownerName?`<div class="meta"><b>Egasi:</b> ${s.ownerName}</div>`:''}
          ${phoneCallRowsHtml(s.phone, s.extraPhones)}
          ${s.address?`<div class="meta"><b>Manzil:</b> ${s.address}</div>`:''}
        </div>
        ${isAdmin?`<button class="ghostBtn" style="flex-shrink:0;padding:8px 10px;" onclick="closeModal('modalStoreDetail');openStoreModal('${s.id}')">${ic('edit',14)}Tahrirlash</button>`:''}
      </div>
    </div>
    `:''}
    ${salesBlock}
    ${(lat!=null)?`<button class="ghostBtn" style="width:100%;margin-bottom:10px;" onclick="openYandexNavigator(${lat}, ${lng}, '${escName(navName)}')">${ic('pin',15)}Navigator — manzilga borish</button>`:''}
    ${!isNew?`<div class="statGrid" style="grid-template-columns:1fr;margin-bottom:10px;">
      <div class="statCard ${debt>0?'warn':''}"><div class="num">${fmt(debt)}</div><div class="lbl">Umumiy qarz (so'm)</div></div>
    </div>`:''}
    ${!isNew && debt>0?`<button class="ghostBtn" style="width:100%;margin-bottom:10px;" onclick="openPay('store','${s.id}','${escName(s.name)}')">To'lov qabul qilish</button>`:''}
    ${isAdmin?`
    <div class="orderTypeToggle" id="sdTabRow" style="margin-bottom:12px;">
      <button id="sdTabBtnSotish" onclick="setSdTab('sotish')">${ic('card',15)}SOTISH</button>
      <button id="sdTabBtnBuyurtma" onclick="setSdTab('buyurtma')">${ic('receipt',15)}BUYURTMA</button>
    </div>
    <div id="sdForm" class="hidden">
      ${isNew?`<div class="field"><label>Ro'yxatdan o'tgan do'kon egasi</label>
        <select id="sdOwnerPick" onchange="pickSdOwner()">
          <option value="">— Yangi do'kon (ro'yxatdan o'tmagan) —</option>
          ${state.users.filter(u=>u.userType==='store' && !state.stores.some(s2=>s2.ownerUserId===u.id)).map(u=>`<option value="${u.id}">${u.name} — ${u.storeName||'nomsiz'}${typeof u.homeLat==='number'?' 📍':''}</option>`).join('')}
        </select>
        <div id="sdOwnerLocNote" class="smallMuted" style="margin-top:6px;display:none;color:#925E78;font-weight:700;"></div>
      </div>`:''}
      <div class="field"><label>Do'kon nomi</label><input id="sdStoreName" value="${isNew?'':(s.name||'')}" placeholder="Do'kon nomi" autocomplete="off"></div>
      <div class="field"><label>Do'kon egasining ism familyasi</label><input id="sdOwnerName" value="${isNew?'':(s.ownerName||'')}" placeholder="Ism va familiya" autocomplete="off"></div>
      <div class="field hidden" id="sdPhoneWrap"><label>Telefon (ixtiyoriy)</label><input id="sdPhone" value="${isNew?'':(s.phone||'')}" placeholder="+998 90 000 00 00" autocomplete="off"></div>
      <div class="field hidden" id="sdAddrWrap"><label>Manzil (ixtiyoriy)</label><input id="sdAddr" value="${isNew?'':(s.address||'')}" placeholder="Ko'cha, mo'ljal" autocomplete="off"></div>
      <button type="button" class="ghostBtn" style="width:100%;margin-bottom:8px;" onclick="toggleSdProductPicker()">${ic('box',14)}Tovar tanlash</button>
      <div id="sdProductPicker" class="hidden" style="margin-bottom:8px;"></div>
      <div class="smallMuted" style="margin:2px 0 6px;font-weight:700;">Tanlangan tovarlar:</div>
      <div id="sdProductList"></div>
      <div class="field"><label>Tovarlar summasi (avtomatik, so'm)</label><input id="sdTotal" readonly value="0" autocomplete="off"></div>
      <div class="field"><label>Shu summadan qanchasini berdi (so'm)</label><input id="sdPaid" type="number" value="0" oninput="updateSdRemaining()" autocomplete="off"></div>
      <div class="field"><label>Qolgan qarz (avtomatik, so'm)</label><input id="sdRemaining" readonly value="0" autocomplete="off"></div>
      <div class="field" id="sdDueWrap"><label>Qarzni qachon beradi</label><input id="sdDue" type="date" autocomplete="off"></div>
      <div class="field hidden" id="sdDeliveryWrap"><label>Buyurtma qachon yetkaziladi</label><input id="sdDelivery" type="datetime-local" autocomplete="off"></div>
      <button class="primaryBtn" id="sdSaveBtn" onclick="confirmSdAction()">Saqlash</button>
      <button class="ghostBtn" style="margin-top:8px;width:100%;" onclick="closeModal('modalStoreDetail')">Bekor qilish</button>
    </div>
    `:''}
    ${!isNew?`
    <div class="sectionHead"><h2>Tarix</h2></div>
    ${items.map(l=>ledgerRowHtml(l,true)).join('') || emptyHtml('receipt','Hali yozuv yo\'q')}
    `:''}
  `;
  if(isNew){ document.getElementById('sdPhoneWrap').classList.remove('hidden'); document.getElementById('sdAddrWrap').classList.remove('hidden'); }
  refreshSdSummary();
}

function setSdTab(tab){
  sdTab = tab;
  const form = document.getElementById('sdForm');
  if(form) form.classList.remove('hidden');
  const bS = document.getElementById('sdTabBtnSotish'), bB = document.getElementById('sdTabBtnBuyurtma');
  if(bS) bS.classList.toggle('active', tab==='sotish');
  if(bB) bB.classList.toggle('active', tab==='buyurtma');
  const dueWrap = document.getElementById('sdDueWrap'), delWrap = document.getElementById('sdDeliveryWrap');
  if(dueWrap) dueWrap.classList.toggle('hidden', tab!=='sotish');
  if(delWrap) delWrap.classList.toggle('hidden', tab!=='buyurtma');
}

function changeSdQty(pid,delta){
  sdDraft[pid] = Math.max(0,(sdDraft[pid]||0)+delta);
  if(sdDraft[pid]===0) delete sdDraft[pid];
  const el = document.getElementById('pp-qty-'+pid);
  if(el) el.textContent = sdDraft[pid]||0;
  refreshSdSummary();
}

function refreshSdSummary(){
  const listEl = document.getElementById('sdProductList');
  const totalEl = document.getElementById('sdTotal');
  if(!listEl || !totalEl) return;
  const entries = Object.entries(sdDraft);
  let total = 0;
  listEl.innerHTML = entries.map(([pid,qty])=>{
    const p = state.products.find(x=>x.id===pid);
    if(!p) return '';
    const line = priceOf(p,'store')*qty;
    total += line;
    return `<div class="sessionRow"><span style="display:flex;align-items:center;gap:8px;"><span class="prodThumbSm" style="width:30px;height:30px;">${prodThumb(p,13)}</span><b>${p.name}</b><span class="icQtyMini">×${qty}</span></span><b>${fmt(line)} so'm</b></div>`;
  }).join('') || emptyHtml('box','Hali tovar tanlanmagan');
  totalEl.value = fmt(total);
  totalEl.dataset.raw = total;
  updateSdRemaining();
}

function updateSdRemaining(){
  const totalEl = document.getElementById('sdTotal');
  const paidEl = document.getElementById('sdPaid');
  const remEl = document.getElementById('sdRemaining');
  if(!totalEl || !paidEl || !remEl) return;
  const total = parseFloat(totalEl.dataset.raw||0);
  let paid = parseFloat(paidEl.value)||0;
  if(paid>total) paid = total;
  remEl.value = fmt(Math.max(total-paid,0));
}

async function confirmSdAction(){
  if(!sdTab){ alert('Avval SOTISH yoki BUYURTMA tugmasini tanlang'); return; }
  const entries = Object.entries(sdDraft);
  if(!entries.length){ alert('Kamida bitta tovar tanlang'); return; }
  const name = document.getElementById('sdStoreName').value.trim();
  const ownerName = document.getElementById('sdOwnerName').value.trim();
  if(!name){ alert('Do\'kon nomini kiriting'); return; }
  if(!ownerName){ alert('Do\'kon egasining ism familyasini kiriting'); return; }

  let s;
  if(sdStoreId){
    s = state.stores.find(x=>x.id===sdStoreId);
    s.name = name; s.ownerName = ownerName;
  } else {
    const phone = (document.getElementById('sdPhone')||{}).value?.trim() || '';
    const address = (document.getElementById('sdAddr')||{}).value?.trim() || '';

    /* BITTA RAQAM — BITTA DO'KON.
       Shu raqamdagi do'kon bor bo'lsa, yangisini yaratmaymiz —
       savdo/buyurtma MAVJUD do'konga yoziladi. Shunda bitta magazin
       uchun ikki-uch karta va ikkita qarz tarixi paydo bo'lmaydi. */
    let ownerUserId = sdSelectedOwnerUserId || null;
    if(!ownerUserId && phone && typeof findStoreOwnerByContact === 'function'){
      const owner = findStoreOwnerByContact(phone);
      if(owner) ownerUserId = owner.id;
    }
    const existing =
      (ownerUserId && typeof storeOfOwner === 'function' ? storeOfOwner(ownerUserId) : null) ||
      (phone && typeof findStoreByPhone === 'function' ? findStoreByPhone(phone) : null);

    if(existing){
      s = existing;
      /* Yangi joy belgilangan bo'lsa va eski karta joyi hali
         aniqlanmagan bo'lsa — aniqlashtiramiz */
      if(s.needsLocation && sdLatLng){ s.lat = sdLatLng.lat; s.lng = sdLatLng.lng; s.needsLocation = false; }
      if(!s.phone && phone) s.phone = phone;
      if(!s.address && address) s.address = address;
      alert("Bu raqamdagi do'kon allaqachon bor — yozuv \""+s.name+"\" do'koniga qo'shildi.");
    } else {
      s = {id:uid('s'), name, ownerName, phone, address, lat:sdLatLng.lat, lng:sdLatLng.lng, ownerUserId: ownerUserId||null};
      state.stores.push(s);
      if(ownerUserId){
        const ou = state.users.find(x=>x.id===ownerUserId);
        if(ou) ou.autoStoreCreated = true;
      }
    }
  }

  const items = entries.map(([pid,qty])=>{
    const p = state.products.find(x=>x.id===pid);
    return {productId:pid, name:p.name, qty, gram:p.gram, unitType:p.unitType, price:priceOf(p,'store')};
  });
  const total = items.reduce((sum,i)=>sum+i.price*i.qty,0);
  let paid = parseFloat(document.getElementById('sdPaid').value)||0;
  if(paid>total) paid = total;
  const debt = Math.max(total-paid,0);

  if(sdTab==='sotish'){
    const due = document.getElementById('sdDue').value;
    state.ledger.push({
      id:uid('l'), partyType:'store', partyId:s.id, partyName:s.name, ownerName,
      items, total, paid, debt, date:todayISO(),
      due: due||null, status: debt>0?'debt':'paid'
    });
  } else {
    const deliveryTime = document.getElementById('sdDelivery').value;
    state.orders.push({
      id: uid('o'), userId: currentUser?currentUser.id:'admin', customerId: currentUser?currentUser.id:'admin',
      customerName: s.name, customerPhone: s.phone||'',
      orderType: 'dokon', storeId: s.id, storeName: s.name, storeAddress: s.address||'',
      lat: s.lat, lng: s.lng,
      items, total, paid, debt, paymentStatus: debt>0?'qarz':'tolandi', deliveryTime: deliveryTime||null,
      date: todayISO(), status:'yangi'
    });
    if(debt>0){
      const due = document.getElementById('sdDue').value;
      state.ledger.push({
        id:uid('l'), partyType:'store', partyId:s.id, partyName:s.name, ownerName,
        items, total, paid, debt, date:todayISO(), due: due||null, status:'debt'
      });
    }
  }
  await saveState();
  closeModal('modalStoreDetail');
  try{ renderStores(); }catch(e){ console.error('renderStores xato', e); }
  try{ renderDash(); }catch(e){ console.error('renderDash xato', e); }
  try{ renderOrdersAdmin(); }catch(e){ console.error('renderOrdersAdmin xato', e); }
  try{ refreshOrderPinsOnMaps(); }catch(e){ console.error('refreshOrderPinsOnMaps xato', e); }
  openStoreDetail(s.id);
}

/* ============================================================
   FAVQULODDA MA'LUMOT TIKLASH — ?restore=1 bilan ochiladi.
   Bu qurilmadagi (localStorage) ma'lumotni ko'rsatadi va, admin
   tasdiqlasa, MAJBURIY ravishda bulutga qaytarib yozadi —
   oddiy vaqt-belgisi solishtirishini chetlab o'tib, chunki bu
   holatda mahalliy ma'lumot BILAMAN yaxshiroq ekanini biz aytamiz.
   ============================================================ */
function initRestoreModeIfNeeded(){
  const params = new URLSearchParams(location.search);
  if(params.get('restore') !== '1') return;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('restoreModeBg').classList.remove('hidden');
  const counts = document.getElementById('restoreCounts');
  counts.innerHTML = `
    Mahsulotlar: <b>${(state.products||[]).length}</b><br>
    Foydalanuvchilar: <b>${(state.users||[]).length}</b><br>
    Do'konlar: <b>${(state.stores||[]).length}</b><br>
    Buyurtmalar: <b>${(state.orders||[]).length}</b><br>
    Turkumlar: <b>${(state.categories||[]).length}</b>
  `;
}

async function performEmergencyRestore(){
  if(!confirm("Diqqat: bu shu qurilmadagi ma'lumotni BULUTDAGI hozirgi holatning USTIGA yozadi. Davom etamizmi?")) return;
  if(!fsDb){ alert("Internet aloqasi yo'q. Internetga ulaning va qaytadan urinib ko'ring."); return; }
  const resultEl = document.getElementById('restoreResult');
  resultEl.textContent = "Tiklanmoqda...";
  try{
    const now = Date.now();
    const keys = Object.keys(state);
    for(const key of keys){
      await fsDb.collection('app').doc(key).set({
        v: JSON.stringify(state[key]),
        t: now
      });
    }
    resultEl.textContent = "✅ Muvaffaqiyatli tiklandi! Endi boshqa qurilmalarda ilovani yangilang.";
    resultEl.style.color = 'var(--success)';
  }catch(e){
    resultEl.textContent = "❌ Xato: " + (e.message||e);
    resultEl.style.color = 'var(--danger)';
  }
}


/* ═══ Magazinlar ro'yxatini ochish / yopish ═══
   Bir bosishda pastga oqib ochiladi va OCHIQ QOLADI.
   Qayta bosilgandagina yopiladi. Holat eslab qolinadi. */
function toggleStoreList(force){
  const wrap = document.getElementById('storeListWrap');
  const btn = document.getElementById('storeListToggle');
  if(!wrap || !btn) return;
  const open = typeof force === 'boolean' ? force : !wrap.classList.contains('open');
  wrap.classList.toggle('open', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  try{ localStorage.setItem('utam_storeListOpen', open ? '1' : '0'); }catch(e){}
}

function filterStoreList(q){
  q = (q || '').trim().toLowerCase();
  document.querySelectorAll('#storeList .slRow').forEach(function(r){
    const hay = r.getAttribute('data-q') || '';
    r.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
  });
}

(function(){
  function init(){
    try{ if(localStorage.getItem('utam_storeListOpen') === '1') toggleStoreList(true); }catch(e){}
    const ic = document.querySelector('#storeListToggle .sltIc');
    if(ic && typeof window.ic === 'function') ic.innerHTML = window.ic('store', 18);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
