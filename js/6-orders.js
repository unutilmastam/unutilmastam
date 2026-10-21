/* Unutilmas Ta'm — 6-orders
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

/* ---- Yangi kelgan buyurtmalarning manzili: xaritada QORA rangda yonib-o'chib turuvchi belgi ---- */
function orderPinDivIcon(){
  const svg = `<svg width="32" height="40" viewBox="0 0 24 30" class="pinIcon">
    <defs><linearGradient id="opg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2A2A2E"/><stop offset="100%" stop-color="#000"/></linearGradient></defs>
    <path d="M12 29S2 17.8 2 11a10 10 0 0 1 20 0c0 6.8-10 18-10 18Z" fill="url(#opg)" stroke="#fff" stroke-width="1.8"/>
    <ellipse cx="9" cy="6.5" rx="4.5" ry="2.6" fill="#fff" opacity=".22" transform="rotate(-24 9 6.5)"/>
    <circle cx="12" cy="11" r="4.4" fill="#fff"/>
    <path d="M10.2 11l1.3 1.3 2.4-2.6" stroke="#000" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return L.divIcon({html:svg, className:'orderPinBlink', iconSize:[32,40], iconAnchor:[16,38], popupAnchor:[0,-34]});
}

function activeOrdersWithLocation(){
  // yetkazilmagan (hali yo'lda/yangi) va manzili (xaritadan yoki joylashuvdan) belgilangan buyurtmalar
  return state.orders.filter(o=>o.status!=='yetkazildi' && typeof o.lat==='number' && typeof o.lng==='number');
}

function orderPinLabel(o){
  return o.orderType==='dokon' ? (o.storeName||o.customerName||'Do\'kon') : (o.customerName||'Mijoz');
}

function plotOrderPinsOnMap(mapInstance, markersRef){
  markersRef.forEach(m=>mapInstance.removeLayer(m));
  markersRef.length = 0;
  activeOrdersWithLocation().forEach(o=>{
    const label = orderPinLabel(o);
    const marker = L.marker([o.lat,o.lng], {icon:orderPinDivIcon(), zIndexOffset:2000}).addTo(mapInstance);
    marker.bindTooltip(`${label} — yangi buyurtma`, {permanent:true, direction:'top', offset:[0,-32], className:'mapNameLabel orderPinLabel'});
    marker.on('click', (e)=>{ L.DomEvent.stopPropagation(e); openYandexNavigator(o.lat, o.lng, label); });
    markersRef.push(marker);
  });
}

function refreshOrderPinsOnMaps(){
  if(leafletMap) plotOrderPinsOnMap(leafletMap, orderMapMarkers);
  if(fullLeafletMap) plotOrderPinsOnMap(fullLeafletMap, fullOrderMapMarkers);
}

/* ==================== STORE STATUS (debt / pending order / clean) — drives marker + badge colors ==================== */
function storeHasPendingOrder(storeId){
  return state.orders.some(o=>o.storeId===storeId && o.status!=='yetkazildi');
}

/* ==================== ORDERS (admin) ==================== */
function orderSourceHtml(o){
  // Buyurtma ilovada ro'yxatdan o'tgan qaysi foydalanuvchi tomonidan berilganini adminga ko'rsatadi
  const u = o.userId ? state.users.find(x=>x.id===o.userId) : null;
  if(!u){
    return `<div class="meta">${ic('user',12)} Manba: <b>Admin tomonidan kiritilgan</b> (ilovadan emas)</div>`;
  }
  const roleTxt = u.userType==='store' ? 'Ro\'yxatdan o\'tgan do\'kon egasi' : 'Ro\'yxatdan o\'tgan mijoz';
  const avatar = u.photo ? `<img src="${u.photo}">` : ic('user',13);
  const verified = u.verified ? ` ${ic('shieldCheck',12,'')}` : '';
  return `<div class="meta" style="display:flex;align-items:center;gap:7px;">
    <span class="avatarSm" style="width:22px;height:22px;">${avatar}</span>
    Ilovadan: <b>${u.name}</b><span class="verifiedTick">${verified}</span>
    <span class="smallMuted">(${roleTxt} · ${u.contact}${u.createdAt?(' · ro\'yxatdan o\'tgan: '+u.createdAt):''})</span>
  </div>`;
}

function toggleOrderRow(id){
  try{
    __lastTouchTs = Date.now(); // muvaffaqiyatli bosishdan keyin fon yangilanishini yana kechiktiramiz
    openOrderRowId = (openOrderRowId===id) ? null : id;
    const detail = document.getElementById('odetail-'+id);
    const chev = document.getElementById('ochev-'+id);
    if(!detail){
      alert('DIAGNOSTIKA: "odetail-'+id+'" elementi topilmadi. Iltimos, screenshot olib yuboring.');
      return;
    }
    detail.classList.toggle('open', openOrderRowId===id);
    if(chev) chev.classList.toggle('open', openOrderRowId===id);
  }catch(err){
    alert('DIAGNOSTIKA XATOSI (buni screenshot qilib yuboring):\n\n' + (err && err.message ? err.message : err) + '\n\nBuyurtma ID: ' + id);
    console.error('toggleOrderRow xatosi:', err);
  }
}

async function setOrderEta(orderId){
  const mins = prompt("Necha daqiqada yetkaziladi? (masalan: 25)");
  if(!mins) return;
  const n = parseInt(mins);
  if(isNaN(n) || n<=0) return;
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.etaMinutes = n; o.etaSetAt = Date.now();
  await saveState();
  pushNotification(o.userId, 'Yetkazish vaqti', `Buyurtmangiz taxminan ${n} daqiqada yetkaziladi.`, 'order', {type:'order', id:o.id});
  renderOrdersAdmin();
}

/* ============================================================
   KURYER JONLI JOYLASHUVI (havola orqali, alohida rejim)
   ============================================================ */
/* ============================================================
   XAVFSIZ BUYURTMA YANGILASH — Firestore TRANZAKSIYASI orqali.
   Bu — "eski keshdagi ma'lumot qaytadan tiklanib qolish" bug'ini
   butunlay yo'q qiladi: har doim SERVERDAGI ENG YANGI holatni o'qib,
   faqat kerakli maydonni o'zgartirib, zudlik bilan qaytadan yozamiz —
   boshqa hech kim orada o'zgartirgan bo'lsa ham, hech narsa yo'qolmaydi.
   ============================================================ */
async function courierSafeUpdateOrder(orderId, mutateFn){
  if(!fsDb){ alert("Internet aloqasi yo'q — qaytadan urinib ko'ring"); return null; }
  const docRef = fsDb.collection('app').doc('orders');
  let resultOrder = null, notFound = false;
  try{
    await fsDb.runTransaction(async (tx)=>{
      const doc = await tx.get(docRef);
      const data = doc.exists ? doc.data() : {v:'[]', t:0};
      let orders;
      try{ orders = JSON.parse(data.v||'[]'); }catch(e){ orders = []; }
      const order = orders.find(o=>o.id===orderId);
      if(!order){ notFound = true; return; }
      mutateFn(order);
      resultOrder = {...order};
      tx.set(docRef, {v: JSON.stringify(orders), t: Date.now()});
    });
  }catch(e){
    console.warn('courierSafeUpdateOrder xato:', e);
    alert("Yangilashda xato yuz berdi, qaytadan urinib ko'ring");
    return null;
  }
  if(notFound) return null;
  if(resultOrder){
    const idx = state.orders.findIndex(o=>o.id===orderId);
    if(idx>=0) state.orders[idx] = resultOrder; else state.orders.push(resultOrder);
    try{ localSave(); }catch(e){}
  }
  return resultOrder;
}

function renderCourierOrderInfo(o){
  document.getElementById('courierCustomerName').textContent = o.customerName || 'Mijoz';
  const phoneLink = document.getElementById('courierPhoneLink');
  if(o.customerPhone){ phoneLink.href = 'tel:'+o.customerPhone; phoneLink.textContent = '📞 '+o.customerPhone; }
  else { phoneLink.textContent = ''; }
  document.getElementById('courierAddress').textContent = o.storeAddress || "Manzil xaritada belgilangan";
  document.getElementById('courierItemsSummary').innerHTML = itemChipsHtml(o.items||[], {gram:true});
  document.getElementById('courierOrderTotal').textContent = fmt(o.total||0) + " so'm";
}

async function courierAcceptOrder(){
  const updated = await courierSafeUpdateOrder(courierOrderId, o=>{ o.courierAccepted = true; });
  if(!updated){ showCourierLockedState('❓','Buyurtma topilmadi',''); return; }
  if(updated.userId) pushNotification('admin', 'Kuryer qabul qildi', `Buyurtma kuryer tomonidan qabul qilindi.`, 'order', {type:'order', id:courierOrderId});
  renderCourierStateFor(updated);
}

async function courierRejectOrder(){
  if(!confirm("Bu buyurtmani rad etmoqchimisiz?")) return;
  const updated = await courierSafeUpdateOrder(courierOrderId, o=>{ o.courierAccepted = false; });
  if(!updated){ showCourierLockedState('❓','Buyurtma topilmadi',''); return; }
  pushNotification('admin', 'Kuryer rad etdi', `Kuryer buyurtmani rad etdi. Boshqa kuryer belgilash kerak.`, 'order', {type:'order', id:courierOrderId});
  renderCourierStateFor(updated);
}

function orderCardHtml(o){
  const statusBadge = {yangi:'amber', tayyor:'green', yetkazildi:'gray', qaytarildi:'red'}[o.status]||'gray';
  const statusTxt = {yangi:'Yangi', tayyor:'Tayyor', yetkazildi:'Yetkazildi', qaytarildi:'Qaytarilgan'}[o.status]||o.status;
  const typeBadge = o.orderType==='dokon' ? `<span class="badge blue">Do'kon</span>` : `<span class="badge gray">Shaxsiy</span>`;
  const payBadge = o.orderType==='dokon' ? (o.paymentStatus==='qarz' ? `<span class="badge red">Qarz: ${fmt(o.debt||0)} so'm</span>` : o.paymentStatus==='tolandi' ? `<span class="badge green">To'langan</span>` : `<span class="badge amber">To'lov kutilmoqda</span>`) : '';
  const isOpen = openOrderRowId===o.id;
  return `<div class="card debtRowCompact">
    <div class="row" onclick="toggleOrderRow('${o.id}')">
      <div class="debtRowHead">
        <span class="debtRowName">${o.customerName}</span>
        <span class="badge ${statusBadge}" style="font-size:10px;padding:2px 6px;">${statusTxt}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span class="badge gray" style="font-size:11.5px;">${fmt(o.total)} so'm</span>
        <span class="debtChev${isOpen?' open':''}" id="ochev-${o.id}">${ic('chev',14)}</span>
      </div>
    </div>
    <div class="debtDetailBody${isOpen?' open':''}" id="odetail-${o.id}">
      <div class="debtDetailInner">
        ${o.status==='qaytarildi' ? `<div class="returnReasonBanner">⚠️ <b>Mijoz qaytardi:</b> ${o.returnReason||'Sabab kiritilmagan'}</div>` : ''}
        <div class="meta">${o.customerPhone}</div>
        <div class="meta">${typeBadge} ${payBadge} ${o.storeName? (' · '+o.storeName):''}</div>
        ${o.scheduledFor?`<div class="meta" style="color:var(--amber);font-weight:700;">⏰ Belgilangan vaqt: ${new Date(o.scheduledFor).toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>`:''}
        ${o.deliveryZoneName?`<div class="meta">📍 Hudud: ${o.deliveryZoneName} (+${fmt(o.deliveryFee||0)} so'm)</div>`:''}
        ${orderSourceHtml(o)}
        ${itemChipsHtml(o.items,{gram:true})}
        <div class="meta" style="margin-top:8px;">Sana: ${o.date} · Jami: <b style="color:var(--forest-dark);">${fmt(o.total)} so'm</b></div>
        <div class="courierRow" onclick="event.stopPropagation();">
          <span style="font-size:11.5px;font-weight:700;color:var(--muted);">🚴 Kuryer:</span>
          <select id="courierSelect-${o.id}" style="flex:1;" onchange="assignCourierFromSelect('${o.id}')">
            <option value="">Tanlanmagan</option>
            ${(state.couriers||[]).filter(c=>(c.status||'active')==='active').map(c=>`<option value="${c.id}" ${o.courierId===c.id?'selected':''}>${c.name}</option>`).join('')}
          </select>
          <button class="ghostBtn" style="padding:6px 10px;font-size:11px;" onclick="openAddCourierModal('${o.id}')">+ Yangi</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          <button class="ghostBtn" style="padding:6px 10px;font-size:11px;" onclick="event.stopPropagation();sendCourierLinkToTelegram('${o.id}')">${ic('send',12)}Telegram'ga yuborish</button>
          <button class="ghostBtn" style="padding:6px 10px;font-size:11px;" onclick="event.stopPropagation();copyCourierLink('${o.id}')">${ic('pin',12)}Havolani nusxalash</button>
          ${courierTrackingStatusHtml(o)}
        </div>
        ${etaBlockHtml(o)}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          ${o.status==='yangi'?`<button class="ghostBtn" onclick="event.stopPropagation();updateOrderStatus('${o.id}','tayyor')">Tayyor deb belgilash</button>`:''}
          ${o.status!=='yetkazildi'?`<button class="ghostBtn" onclick="event.stopPropagation();setOrderEta('${o.id}')">⏱ Vaqt belgilash</button>`:''}
          ${o.status!=='yetkazildi'?`<button class="ghostBtn" onclick="event.stopPropagation();updateOrderStatus('${o.id}','yetkazildi')">Yetkazildi</button>`:''}
          ${o.status==='yetkazildi'?`<button class="ghostBtn" style="color:var(--forest-dark);font-weight:800;" onclick="event.stopPropagation();openReceiptModal('${o.id}')">${ic('receipt',13)} Chekni ko'rish</button>`:''}
          ${o.orderType==='dokon' && o.paymentStatus!=='tolandi' ? `<button class="ghostBtn" onclick="event.stopPropagation();openOrderPayment('${o.id}')">${ic('card',13)}To'lovni belgilash</button>`:''}
          ${o.lat ? `<button class="ghostBtn" onclick="event.stopPropagation();showOrderOnMap('${o.id}')">${ic('pin',13)}Xaritada ko'rish</button>`:''}
          ${o.lat ? `<button class="ghostBtn" onclick="event.stopPropagation();openYandexNavigator(${o.lat}, ${o.lng}, '${escName(orderPinLabel(o))}')">${ic('pin',13)}Navigator</button>`:''}
          <button class="ghostBtn" style="color:#EF4B62;" onclick="event.stopPropagation();deleteOrder('${o.id}')">${ic('trash',13)}O'chirish</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* Ombordan ayirish FAQAT chek chiqarilganda (ya'ni buyurtma
   "yetkazildi" deb belgilanganda) — admin shunchaki qabul qilganda
   yoki "tayyor" deb belgilaganda EMAS. Bir marta ishlaydi
   (o.stockApplied bilan qo'sh ayirishning oldi olinadi). Kuryer
   ilovasi ham xuddi shu funksiyani chaqiradi (9-courier.js). */
function applyOrderStockOnDeliver(o){
  if(!o || o.stockApplied) return;
  (o.items||[]).forEach(function(i){
    const p = (state.products||[]).find(x=>x.id===i.productId);
    if(p) p.stock = (Number(p.stock)||0) - (Number(i.qty)||0);
  });
  o.stockApplied = true;
}
/* Buyurtma qaytarilsa yoki o'chirilsa — agar ombordan allaqachon
   ayirilgan bo'lsa, orqaga qaytaramiz. */
function revertOrderStockOnReturn(o){
  if(!o || !o.stockApplied) return;
  (o.items||[]).forEach(function(i){
    const p = (state.products||[]).find(x=>x.id===i.productId);
    if(p) p.stock = (Number(p.stock)||0) + (Number(i.qty)||0);
  });
  o.stockApplied = false;
}

async function updateOrderStatus(orderId,status){
  const o = state.orders.find(x=>x.id===orderId);
  o.status = status;
  if(status==='yetkazildi' && !o.deliveredAt) o.deliveredAt = Date.now();
  if(status==='yetkazildi') applyOrderStockOnDeliver(o);
  if(status==='qaytarildi') revertOrderStockOnReturn(o);
  // Ball tizimi: yetkazib berilganda mijozga ball beriladi
  if(status==='yetkazildi' && !o.pointsAwarded && o.userId && o.userId!=='admin' && pointsOn()){
    const u = state.users.find(x=>x.id===o.userId);
    if(u){
      const earned = Math.floor((o.total||0)/pointsPerSom());
      u.points = (u.points||0) + earned;
      o.pointsAwarded = true;
      if(earned>0) pushNotification(o.userId, 'Ball qo\'shildi! 🎁', `Buyurtmangiz uchun ${earned} ball qo'shildi. Jami ballaringiz: ${u.points}.`, 'points');
    }
  }
  await saveState();
  renderOrdersAdmin(); renderDash(); refreshOrderPinsOnMaps();
  if(o.userId && o.userId!=='admin'){
    const statusTxt = {tayyor:'tayyor holatga', yetkazildi:'yetkazib berildi deb'}[status] || status;
    pushNotification(o.userId, 'Buyurtma holati yangilandi', `Buyurtmangiz ${statusTxt} belgilandi.`, 'order', {type:'order', id:o.id});
  }
}

async function deleteOrder(orderId){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  if(!confirm('Bu buyurtma butunlay o\'chiriladi va ilovaning barcha bo\'limlaridan yo\'qoladi.\n\nDIQQAT: do\'konlar ro\'yxati va xaritadagi do\'konlar O\'CHMAYDI — faqat shu buyurtma o\'chadi.\n\nDavom etasizmi?')) return;

  /* KAFOLAT: buyurtma o'chirilganda do'konlar ro'yxati aynan o'zgarishsiz qolishi
     kerak. Xotirada nusxasini olib, saqlashdan keyin solishtiramiz. */
  const storesBefore = JSON.stringify(state.stores || []);

  revertOrderStockOnReturn(o);
  state.orders = state.orders.filter(x=>x.id!==orderId);

  if(JSON.stringify(state.stores || []) !== storesBefore){
    // Hech qachon bo'lmasligi kerak, lekin bo'lsa — darhol tiklaymiz.
    try{ state.stores = JSON.parse(storesBefore); }catch(e){}
    console.warn("Do'konlar ro'yxati o'zgargan edi — tiklandi.");
  }

  await saveState();
  renderOrdersAdmin(); renderDash(); refreshOrderPinsOnMaps();
  try{ renderStores(); }catch(e){}
  if(o.userId && o.userId!=='admin'){
    pushNotification(o.userId, 'Buyurtma bekor qilindi', 'Sizning buyurtmangiz admin tomonidan o\'chirib tashlandi.', 'order');
  }
}

function showOrderOnMap(orderId){
  const o = state.orders.find(x=>x.id===orderId);
  showView('stores');
  setTimeout(()=>{ if(leafletMap && o.lat){ leafletMap.setView([o.lat,o.lng], 15); refreshOrderPinsOnMaps(); } }, 150);
}

function openOrderPayment(orderId){
  payingOrderId = orderId;
  const o = state.orders.find(x=>x.id===orderId);
  document.getElementById('opSummary').textContent = o.storeName+': '+o.items.map(i=>i.name+'×'+i.qty).join(', ');
  document.getElementById('opTotal').value = o.total;
  document.getElementById('opPaid').value = o.total;
  const d = new Date(); d.setDate(d.getDate()+7);
  document.getElementById('opDue').value = d.toISOString().slice(0,10);
  openModal('modalOrderPayment');
}

async function confirmOrderPayment(){
  const o = state.orders.find(x=>x.id===payingOrderId);
  const total = parseFloat(document.getElementById('opTotal').value)||0;
  const paid = parseFloat(document.getElementById('opPaid').value)||0;
  const due = document.getElementById('opDue').value;
  const debt = Math.max(total-paid,0);
  o.total = total; o.paid = paid; o.debt = debt; o.paymentStatus = debt<=0 ? 'tolandi' : 'qarz';

  if(debt>0 && o.storeId){
    state.ledger.push({
      id:uid('l'), partyType:'store', partyId:o.storeId, partyName:o.storeName,
      items:o.items, total, paid, debt, date:todayISO(), due, status:'debt'
    });
  }
  await saveState();
  closeModal('modalOrderPayment');
  renderOrdersAdmin(); renderStores(); renderDash();
}

function openEditOrder(orderId){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  if(o.status!=='yangi'){ alert("Admin bu buyurtmani allaqachon qabul qilgan, shuning uchun uni o'zgartirib bo'lmaydi."); return; }
  editingOrderId = orderId;
  editingOrderItems = o.items.map(i=>({...i}));
  renderEditOrderModal();
  openModal('modalEditOrder');
}

function renderEditOrderModal(){
  const list = document.getElementById('eoItemsList');
  list.innerHTML = editingOrderItems.map((i,idx)=>`
    <div class="sessionRow">
      <span style="display:flex;align-items:center;gap:8px;min-width:0;"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.name}</b></span>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div class="pdQtyBox" style="padding:2px;">
          <button onclick="eoChangeQty(${idx},-1)" style="width:28px;height:28px;">${ic('minus',12)}</button>
          <span style="font-size:14px;min-width:20px;">${i.qty}</span>
          <button onclick="eoChangeQty(${idx},1)" style="width:28px;height:28px;">${ic('plus',12)}</button>
        </div>
        <button class="ghostBtn" style="padding:7px 9px;" onclick="eoRemoveItem(${idx})">${ic('trash',13)}</button>
      </span>
    </div>`).join('') || emptyHtml('cart',"Barcha mahsulotlar olib tashlandi — saqlasangiz buyurtma bekor bo'ladi");
  const total = editingOrderItems.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('eoTotal').textContent = fmt(total)+" so'm";
}

async function confirmEditOrder(){
  const o = state.orders.find(x=>x.id===editingOrderId);
  if(!o) return;
  if(o.status!=='yangi'){ alert("Admin bu buyurtmani allaqachon qabul qilgan, shuning uchun uni o'zgartirib bo'lmaydi."); closeModal('modalEditOrder'); renderCabinet(); return; }
  if(!editingOrderItems.length){
    if(confirm("Barcha mahsulotlar olib tashlandi. Buyurtmani butunlay bekor qilasizmi?")) await customerCancelOrder(editingOrderId, true);
    return;
  }
  o.items = editingOrderItems;
  o.total = editingOrderItems.reduce((s,i)=>s+i.price*i.qty,0);
  await saveState();
  closeModal('modalEditOrder');
  renderCabinet();
  pushNotification('admin', 'Buyurtma o\'zgartirildi', `${o.customerName} o'z buyurtmasini yangiladi (${fmt(o.total)} so'm).`, 'order', {type:'order', id:o.id});
}

async function customerCancelOrder(orderId, skipConfirm){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  if(o.status!=='yangi'){ alert("Admin bu buyurtmani allaqachon qabul qilgan, shuning uchun uni bekor qila olmaysiz."); return; }
  if(!skipConfirm && !confirm("Buyurtmani bekor qilmoqchimisiz?")) return;
  const custName = o.customerName;
  state.orders = state.orders.filter(x=>x.id!==orderId);
  await saveState();
  closeModal('modalEditOrder');
  renderCabinet();
  try{ renderOrdersAdmin(); renderDash(); refreshOrderPinsOnMaps(); }catch(e){}
  pushNotification('admin', 'Buyurtma bekor qilindi', `${custName} o'z buyurtmasini bekor qildi.`, 'order');
}

function openOrderChat(orderId){
  if(!currentUser || currentUser.role==='admin') return;
  const o = state.orders.find(x=>x.id===orderId);
  const chat = getOrCreateChat(currentUser.id, currentUser.name);
  activeChatUserId = currentUser.id;
  chat.unreadUser = false;
  cancelEditMessage();
  document.getElementById('chatTitle').textContent = "Ishlab chiqaruvchiga yozish";
  const input = document.getElementById('chatInput');
  input.value = o ? `Buyurtma (${o.date}) haqida: ` : '';
  renderChatThread();
  updateChatBlockUI();
  openModal('modalChat');
  saveState();
  setTimeout(()=>input.focus(), 200);
}

function setOrderType(type){
  currentOrderType = type;
  document.getElementById('otBtnPersonal').classList.toggle('active', type==='shaxsiy');
  document.getElementById('otBtnStore').classList.toggle('active', type==='dokon');
  document.getElementById('storeOrderFields').classList.toggle('hidden', type!=='dokon');
  document.getElementById('personalOrderFields').classList.toggle('hidden', type!=='shaxsiy');
}

function useOrderLocation(){
  if(!navigator.geolocation){ alert('Geolokatsiya qo\'llab-quvvatlanmaydi'); return; }
  document.getElementById('boLocStatus').textContent = 'Joylashuv aniqlanmoqda...';
  navigator.geolocation.getCurrentPosition(pos=>{
    orderLat = pos.coords.latitude; orderLng = pos.coords.longitude;
    document.getElementById('boLocStatus').innerHTML = `${ic('check',13)} Joylashuv qabul qilindi`;
  }, ()=>{ document.getElementById('boLocStatus').textContent = 'Joylashuvni olib bo\'lmadi'; });
}

async function submitOrder(){
  if(previewBlocked()) return;
  const entries = Object.entries(basket);
  if(!entries.length){ alert('Savat bo\'sh'); return; }

  /* Buyurtma asosidagi mahsulotlar eng kam miqdorga yetdimi? */
  for(const [pid, qty] of entries){
    const p = (state.products||[]).find(x=>x.id===pid);
    if(p && p.preorder){
      const min = Math.max(1, Number(p.minOrder) || 1);
      if(qty < min){
        alert(p.name + " — buyurtma asosida tayyorlanadi.\n\n" +
              "Eng kam buyurtma: " + min + " dona.\nSavatda: " + qty + " dona.\n\n" +
              "Miqdorni oshiring yoki savatdan olib tashlang.");
        return;
      }
    }
  }

  if(!currentUser || currentUser.role!=='user'){
    openAuthModal('login', ()=>{ openModal('modalBasket'); });
    return;
  }
  const myUCheck = state.users.find(x=>x.id===currentUser.id);
  if(myUCheck && myUCheck.blocked){
    alert('Sizning hisobingiz administratsiya tomonidan bloklangan, shuning uchun buyurtma bera olmaysiz.');
    logout();
    return;
  }
  // Joylashuv tanlanmagan bo'lsa — ro'yxatdan o'tishda belgilagan nuqtasi avtomatik olinadi
  if(orderLat==null && myUCheck && typeof myUCheck.homeLat==='number'){
    orderLat = myUCheck.homeLat; orderLng = myUCheck.homeLng;
  }

  let storeId=null, storeName='', storeAddress='', storePhone='';
  let personalPhone='';
  if(currentOrderType==='shaxsiy'){
    personalPhone = document.getElementById('boPersonalPhone').value.trim() || currentUser.contact;
  }
  if(currentOrderType==='dokon'){
    storeName = document.getElementById('boStoreName').value.trim();
    storeAddress = document.getElementById('boStoreAddr').value.trim();
    storePhone = document.getElementById('boStorePhone').value.trim();
    if(!storeName || !storePhone){ alert('Do\'kon nomi va telefon raqamini kiriting'); return; }
    let st = state.stores.find(s=>s.phone===storePhone);
    if(!st){
      st = {id:uid('s'), name:storeName, phone:storePhone, address:storeAddress, lat: orderLat||(41.3111+(Math.random()-0.5)*0.08), lng: orderLng||(69.2797+(Math.random()-0.5)*0.08)};
      state.stores.push(st);
    } else {
      st.name = storeName; st.address = storeAddress||st.address;
      if(orderLat){ st.lat=orderLat; st.lng=orderLng; }
    }
    storeId = st.id;
  }

  const items = entries.map(([pid,qty])=>{
    const p = state.products.find(x=>x.id===pid);
    return {productId:pid, name:p.name, qty, gram:p.gram, unitType:p.unitType, price:priceOf(p)};
  });
  const subtotal = items.reduce((s,i)=>s+i.price*i.qty,0);

  // Promo-kod va ball chegirmasini yakuniy summaga qo'llash
  let total = subtotal;
  let promoUsed = null, pointsUsed = 0;
  if(appliedPromoCode){
    const pd = promoDiscountFor(appliedPromoCode, basketItems());
    total = Math.max(0, total - pd);
    promoUsed = {code: appliedPromoCode.code, discountPercent: appliedPromoCode.discountPercent,
                 maxItems: appliedPromoCode.maxItems || 0, amount: pd};
  }
  const usePointsCb = document.getElementById('usePointsCheckbox');
  const myUserForPoints = state.users.find(x=>x.id===currentUser.id);
  if(usePointsCb && usePointsCb.checked && myUserForPoints && myUserForPoints.points>0){
    const maxUsable = Math.min(myUserForPoints.points, Math.floor(total/pointValue()));
    if(maxUsable>0){
      pointsUsed = maxUsable;
      total = Math.max(0, total - maxUsable*pointValue());
      myUserForPoints.points -= maxUsable;
    }
  }
  /* Hisobdagi pul (bonus / referal) — avtomatik ishlatiladi */
  let balanceUsed = 0;
  if(myUserForPoints && (Number(myUserForPoints.balance) || 0) > 0){
    balanceUsed = Math.min(Number(myUserForPoints.balance) || 0, total);
    if(balanceUsed > 0){
      total -= balanceUsed;
      myUserForPoints.balance = (Number(myUserForPoints.balance) || 0) - balanceUsed;
      myUserForPoints.balanceLog = myUserForPoints.balanceLog || [];
      myUserForPoints.balanceLog.push({ ts: Date.now(), amount: -balanceUsed, reason: 'Buyurtma' });
    }
  }

  const deliveryFee = currentDeliveryFee();
  total += deliveryFee;
  const zoneSel = document.getElementById('boDeliveryZone');
  const deliveryZoneName = zoneSel && zoneSel.value ? (state.deliveryZones.find(z=>z.id===zoneSel.value)||{}).name : null;
  const scheduledFor = (scheduleMode==='later' && document.getElementById('boScheduledTime').value)
    ? document.getElementById('boScheduledTime').value : null;

  const newOrderId = uid('o');
  state.orders.push({
    id: newOrderId, userId: currentUser.id, customerId: currentUser.id, balanceUsed,
    customerName: currentOrderType==='dokon' ? storeName : currentUser.name,
    customerPhone: currentOrderType==='dokon' ? storePhone : personalPhone,
    orderType: currentOrderType,
    storeId, storeName, storeAddress,
    lat: currentOrderType==='dokon' ? (orderLat|| (state.stores.find(s=>s.id===storeId)||{}).lat) : orderLat,
    lng: currentOrderType==='dokon' ? (orderLng|| (state.stores.find(s=>s.id===storeId)||{}).lng) : orderLng,
    items, subtotal, total, paid:0, debt:0, paymentStatus:'kutilmoqda',
    deliveryFee, deliveryZoneName, scheduledFor,
    promoCode: promoUsed, pointsUsed,
    date: todayISO(), status:'yangi'
  });
  if(promoUsed){
    const pc = state.promoCodes.find(p=>p.code===appliedPromoCode.code);
    if(pc) pc.usedCount = (pc.usedCount||0)+1;
  }
  /* Katta xarid uchun sovg'a qutisi */
  const __giftQty = items.reduce(function(a,i){ return a + (i.qty||0); }, 0);
  await saveState();
  basket = {}; updateBasketCount();
  try{ if(typeof addGiftProgress === 'function') setTimeout(function(){ addGiftProgress(currentUser.id, __giftQty); }, 900); }catch(e){}
  appliedPromoCode = null;
  if(usePointsCb) usePointsCb.checked = false;
  document.getElementById('promoRow').classList.remove('hidden');
  document.getElementById('promoAppliedTag').classList.add('hidden');
  document.getElementById('promoInput').value = '';
  closeModal('modalBasket');
  renderCatalog();
  refreshOrderPinsOnMaps();
  pushNotification('admin', 'Yangi buyurtma', `${currentUser.name} tomonidan yangi buyurtma berildi (${fmt(total)} so'm).`, 'order', {type:'order', id:newOrderId});
  notifyAdminViaBot(
    `🆕 <b>Yangi buyurtma!</b>\n\n` +
    `👤 Mijoz: ${currentUser.name}\n` +
    `📞 Telefon: ${currentOrderType==='dokon' ? storePhone : personalPhone}\n\n` +
    items.map(i=>`• ${i.name} × ${i.qty} = ${fmt(i.price*i.qty)} so'm`).join('\n') +
    `\n\n💰 <b>Jami: ${fmt(total)} so'm</b>`
  );
  alert('Buyurtma qabul qilindi! Shaxsiy kabinetingizda ko\'rishingiz mumkin.');
  showView('cabinet');
}

function orderCardHtmlSimple(o){
  const statusBadge = {yangi:'amber', tayyor:'green', yetkazildi:'gray', qaytarildi:'red'}[o.status]||'gray';
  const statusTxt = {yangi:'Yangi', tayyor:'Tayyor', yetkazildi:'Yetkazildi', qaytarildi:'Qaytarilgan'}[o.status]||o.status;
  const typeBadge = o.orderType==='dokon' ? `<span class="badge blue">Do'kon uchun</span>` : `<span class="badge gray">Shaxsiy</span>`;
  const canEdit = o.status==='yangi';
  const courier = o.courierId ? (state.couriers||[]).find(c=>c.id===o.courierId) : null;
  return `<div class="card" id="ocard-${o.id}">
    <div class="row"><div class="title">Buyurtma · ${o.date}</div><span class="badge ${statusBadge}">${statusTxt}</span></div>
    ${itemChipsHtml(o.items,{gram:true})}
    <div class="meta" style="margin-top:8px;">${typeBadge} · Jami: <b style="color:var(--forest-dark);">${fmt(o.total)} so'm</b></div>
    ${etaBlockHtml(o)}
    ${courier && o.status!=='yetkazildi' && o.status!=='qaytarildi' ? `
      <div class="courierInfoCard">
        ${courier.photo ? `<img class="courierInfoPhoto" src="${courier.photo}">` : `<div class="courierInfoPhoto">${(courier.name[0]||'?').toUpperCase()}</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:13.5px;">🚴 ${courier.name}</div>
          <div class="smallMuted" style="font-size:11px;">Buyurtmangizni olib kelmoqda</div>
        </div>
        ${courier.phone ? `<a href="tel:${courier.phone}" class="ghostBtn" style="padding:8px 12px;font-size:11.5px;flex-shrink:0;">📞 Aloqa</a>` : ''}
      </div>
    ` : ''}
    ${(o.courierTrackingOn && o.courierUpdatedAt && (Date.now()-o.courierUpdatedAt<90000)) ? `<button class="ghostBtn" style="width:100%;margin-top:8px;color:var(--success);" onclick="showCourierOnMap('${o.id}')">🟢 Kuryerni xaritada ko'rish</button>` : ''}
    ${o.status==='qaytarildi' && o.returnReason ? `<div class="returnReasonBanner">Sabab: ${o.returnReason}</div>` : ''}
    ${canEdit
      ? `<div style="display:flex;gap:6px;margin-top:9px;">
           <button class="ghostBtn" style="flex:1;" onclick="openEditOrder('${o.id}')">${ic('edit',13)}Tahrirlash</button>
           <button class="ghostBtn" style="flex:1;color:#EF4B62;" onclick="customerCancelOrder('${o.id}')">${ic('trash',13)}Bekor qilish</button>
         </div>`
      : `<div class="smallMuted" style="margin-top:8px;">${ic('check',12)} Admin tomonidan qabul qilingan — endi o'zgartirib bo'lmaydi</div>`}
    ${o.status==='yetkazildi' ? ratingBlockHtml(o) : ''}
    ${(o.status==='yetkazildi' && currentUser && currentUser.role==='admin') ? `<button class="ghostBtn" style="width:100%;margin-top:6px;color:var(--forest-dark);font-weight:800;" onclick="openReceiptModal('${o.id}')">${ic('receipt',13)} Chekni ko'rish</button>` : ''}
    <button class="ghostBtn" style="width:100%;margin-top:6px;" onclick="openOrderChat('${o.id}')">${ic('chat',13)}Ishlab chiqaruvchiga yozish</button>
  </div>`;
}

async function rateOrder(orderId, stars){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.rating = stars;
  await saveState();
  pushNotification('admin', 'Yangi baho', `Buyurtma ${stars} yulduz bilan baholandi.`, 'info');
  renderCabinet();
}
