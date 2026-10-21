/* Unutilmas Ta'm — 9-courier
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function courierTrackingStatusHtml(o){
  if(!o.courierTrackingOn || !o.courierUpdatedAt) return '';
  const staleMs = Date.now() - o.courierUpdatedAt;
  const isLive = staleMs < 90000; // 90 soniyadan yangi bo'lsa "jonli" deb hisoblanadi
  return `<button class="ghostBtn" style="padding:6px 10px;font-size:11px;color:${isLive?'var(--success)':'var(--muted)'};" onclick="event.stopPropagation();showCourierOnMap('${o.id}')">
    ${isLive?'🟢 Jonli joylashuv':'⚪ Joylashuv (eski)'}
  </button>`;
}

function openCouriersModal(){
  renderCouriersList();
  openModal('modalCouriers');
}

function renderCouriersList(){
  const box = document.getElementById('couriersList');
  const couriers = state.couriers || [];
  box.innerHTML = couriers.map(c=>`
    <div class="sessionRow">
      <span>
        <b>${c.name}</b>
        <div class="smallMuted" style="font-size:11px;">${c.telegramChatId ? "✅ Bot orqali ro'yxatdan o'tgan" : ("@"+(c.telegramUsername||"—")+" (qo'lda qo'shilgan)")}</div>
      </span>
      <button class="ghostBtn" style="padding:6px 10px;font-size:11px;color:var(--danger);" onclick="deleteCourier('${c.id}')">O'chirish</button>
    </div>
  `).join('') || emptyHtml('users',"Hali kuryer yo'q");
}

function copyCourierRegLink(){
  const link = `https://t.me/${TG_VERIFY.bot}?start=kuryer`;
  const done = ()=>alert("Havola nusxalandi! Buni kuryerlaringizga yuboring:\n\n"+link);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(link).then(done).catch(done);
  } else { done(); }
}

async function deleteCourier(id){
  if(!confirm("Bu kuryerni ro'yxatdan o'chirmoqchimisiz?")) return;
  state.couriers = state.couriers.filter(c=>c.id!==id);
  await saveState();
  renderCouriersList();
}

function openAddCourierModal(orderId){
  pendingCourierOrderId = orderId || null;
  pendingCourierPhoto = null;
  document.getElementById('courierName').value = '';
  document.getElementById('courierPhone').value = '';
  document.getElementById('courierTgUsername').value = '';
  document.getElementById('courierPhotoPreview').classList.add('hidden');
  document.getElementById('courierPhotoPlaceholder').classList.remove('hidden');
  openModal('modalAddCourier');
}

async function createCourier(){
  const name = document.getElementById('courierName').value.trim();
  const phone = document.getElementById('courierPhone').value.trim();
  let tg = document.getElementById('courierTgUsername').value.trim().replace(/^@/,'');
  if(!name){ alert('Kuryer ismini kiriting'); return; }
  if(!tg){ alert("Telegram foydalanuvchi nomini kiriting"); return; }
  const courier = {id:uid('cr'), name, phone: phone||null, photo: pendingCourierPhoto||null, telegramUsername: tg, status:'active'};
  state.couriers.push(courier);
  await saveState();
  closeModal('modalAddCourier');
  if(pendingCourierOrderId){
    const o = state.orders.find(x=>x.id===pendingCourierOrderId);
    if(o){ o.courierId = courier.id; o.courier = courier.name; await saveState(); }
    renderOrdersAdmin();
  }
}

async function assignCourierFromSelect(orderId){
  const sel = document.getElementById('courierSelect-'+orderId);
  const o = state.orders.find(x=>x.id===orderId);
  if(!o) return;
  const courier = state.couriers.find(c=>c.id===sel.value);
  o.courierId = courier ? courier.id : null;
  o.courier = courier ? courier.name : null;
  await saveState();
}

async function sendCourierLinkToTelegram(orderId){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o){ return; }
  const courier = state.couriers.find(c=>c.id===o.courierId);
  if(!courier){ alert("Avval kuryerni tanlang yoki qo'shing"); return; }
  const link = courierLinkFor(orderId);
  const msg = `Assalomu alaykum, ${courier.name}! Yangi yetkazish bor:\n${o.customerName} — ${fmt(o.total)} so'm\n\nBatafsil va joylashuvni ulashish uchun:\n${link}`;

  if(courier.telegramChatId){
    // Kuryer bot orqali ro'yxatdan o'tgan — xabar TO'G'RIDAN-TO'G'RI, kuryer
    // hech narsa bosmasdan, botning o'zidan avtomatik yuboriladi.
    try{
      const res = await fetch(TG_VERIFY.api.replace(/\/$/,'') + '/send-courier', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: courier.telegramChatId, message: msg})
      });
      const data = await res.json();
      if(data.ok){ alert(`✅ Xabar ${courier.name}ga Telegram orqali avtomatik yuborildi!`); return; }
      throw new Error(data.error || 'noma\'lum xato');
    }catch(e){
      console.warn('Avtomatik yuborishda xato, zaxira usulga o\'tilmoqda:', e);
    }
  }
  // Zaxira: kuryer hali botda ro'yxatdan o'tmagan (faqat username bor) —
  // Telegram'ni ochib, xabarni tayyor holda ko'rsatamiz (1 marta bosib yuboradi)
  if(courier.telegramUsername){
    const url = `https://t.me/${courier.telegramUsername}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  } else {
    alert("Bu kuryer hali botda ro'yxatdan o'tmagan va Telegram nomi ham kiritilmagan.");
  }
}

function courierLinkFor(orderId){
  const url = new URL(location.href.split('?')[0]);
  url.searchParams.set('courier', orderId);
  return url.toString();
}

function copyCourierLink(orderId){
  const link = courierLinkFor(orderId);
  const done = ()=>alert("Kuryer havolasi nusxalandi! Uni kuryerga (Telegram/SMS orqali) yuboring.\n\n"+link);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(link).then(done).catch(done);
  } else { done(); }
}

async function initCourierModeIfNeeded(){
  const params = new URLSearchParams(location.search);
  const orderId = params.get('courier');
  if(!orderId) return;
  courierOrderId = orderId;

  document.getElementById('appShell').style.display = 'none';
  const bg = document.getElementById('courierModeBg');
  bg.classList.remove('hidden');
  const cLogo = document.getElementById('courierLogoImg');
  if(cLogo) cLogo.src = getAppLogo();

  let o = null;
  try{
    if(fsDb){
      const doc = await fsDb.collection('app').doc('orders').get({source:'server'});
      const data = doc.exists ? doc.data() : null;
      const orders = data ? JSON.parse(data.v||'[]') : [];
      o = orders.find(x=>x.id===orderId);
      if(o){
        const idx = state.orders.findIndex(x=>x.id===orderId);
        if(idx>=0) state.orders[idx]=o; else state.orders.push(o);
      }
    } else {
      o = state.orders.find(x=>x.id===orderId);
    }
  }catch(e){
    console.warn('Kuryer rejimi: serverdan olishda xato, mahalliy nusxa ishlatiladi', e);
    o = state.orders.find(x=>x.id===orderId);
  }

  document.getElementById('courierLoadingMsg').classList.add('hidden');
  document.getElementById('courierMainContent').classList.remove('hidden');

  if(!o){
    showCourierLockedState('❓', "Buyurtma topilmadi", "Bu havola eskirgan yoki noto'g'ri bo'lishi mumkin.");
    return;
  }
  renderCourierOrderInfo(o);
  renderCourierStateFor(o);
}

function hideAllCourierSections(){
  ['courierDecisionSection','courierActiveSection','courierReturnFormSection','courierLockedSection'].forEach(id=>{
    document.getElementById(id).classList.add('hidden');
  });
}

function showCourierLockedState(icon, title, text){
  hideAllCourierSections();
  document.getElementById('courierLockedIcon').textContent = icon;
  document.getElementById('courierLockedTitle').textContent = title;
  document.getElementById('courierLockedText').textContent = text || '';
  document.getElementById('courierLockedSection').classList.remove('hidden');
}

function renderCourierStateFor(o){
  if(o.status==='yetkazildi'){
    stopCourierWatch();
    showCourierLockedState('✅', "Yetkazildi", "Bu buyurtma muvaffaqiyatli yetkazilgan deb belgilangan. Rahmat!");
    return;
  }
  if(o.status==='qaytarildi'){
    stopCourierWatch();
    showCourierLockedState('↩️', "Mijozga qaytarilgan", o.returnReason ? ('Sabab: '+o.returnReason) : '');
    return;
  }
  if(o.courierAccepted===false){
    stopCourierWatch();
    showCourierLockedState('❌', "Siz rad etgansiz", "Bu buyurtmani boshqa kuryerga o'tkazish uchun admin bilan bog'laning.");
    return;
  }
  if(o.courierAccepted===true){
    hideAllCourierSections();
    document.getElementById('courierActiveSection').classList.remove('hidden');
    courierSharingOn = !!o.courierTrackingOn;
    updateCourierSwitchUI();
    if(courierSharingOn) startCourierWatch();
    return;
  }
  hideAllCourierSections();
  document.getElementById('courierDecisionSection').classList.remove('hidden');
}

async function courierMarkDelivered(){
  if(!confirm("Buyurtma muvaffaqiyatli yetkazildimi?")) return;
  stopCourierWatch();
  const updated = await courierSafeUpdateOrder(courierOrderId, o=>{
    o.status = 'yetkazildi';
    o.courierTrackingOn = false;
    o.deliveredAt = Date.now();
  });
  if(!updated){ showCourierLockedState('❓','Buyurtma topilmadi',''); return; }
  /* Ombordan ayirish aynan shu yerda — buyurtma "yetkazildi" deb
     belgilanganda (admin qabul qilganda emas). */
  try{ applyOrderStockOnDeliver(updated); await saveState(); }catch(e){ console.warn('Ombor yangilash xato:', e); }
  pushNotification('admin', 'Buyurtma yetkazildi', `Kuryer buyurtmani muvaffaqiyatli yetkazdi.`, 'order', {type:'order', id:courierOrderId});
  if(updated.userId) pushNotification(updated.userId, 'Buyurtmangiz yetkazildi! 🎉', 'Xizmatimizni baholashni unutmang.', 'order', {type:'order', id:courierOrderId});
  renderCourierStateFor(updated);
}

function courierShowReturnForm(){
  hideAllCourierSections();
  document.getElementById('courierReturnReason').value = '';
  document.getElementById('courierReturnFormSection').classList.remove('hidden');
}

function courierCancelReturnForm(){
  hideAllCourierSections();
  document.getElementById('courierActiveSection').classList.remove('hidden');
}

async function courierConfirmReturn(){
  const reason = document.getElementById('courierReturnReason').value.trim();
  if(!reason){ alert("Iltimos, sababini yozing"); return; }
  stopCourierWatch();
  const updated = await courierSafeUpdateOrder(courierOrderId, o=>{
    o.status = 'qaytarildi';
    o.returnReason = reason;
    o.courierTrackingOn = false;
  });
  if(!updated){ showCourierLockedState('❓','Buyurtma topilmadi',''); return; }
  /* Agar ombordan allaqachon ayirilgan bo'lsa (kamdan-kam holat) — orqaga qaytaramiz. */
  try{ revertOrderStockOnReturn(updated); await saveState(); }catch(e){ console.warn('Ombor tiklash xato:', e); }
  pushNotification('admin', "⚠️ Mijoz buyurtmani qaytardi", `Sabab: ${reason}`, 'order', {type:'order', id:courierOrderId});
  renderCourierStateFor(updated);
}

function openCourierHistory(){
  const currentOrder = state.orders.find(x=>x.id===courierOrderId);
  const courierId = currentOrder ? currentOrder.courierId : null;
  const box = document.getElementById('courierHistoryList');
  const mine = state.orders.filter(o=>o.courierId===courierId && (o.status==='yetkazildi' || o.status==='qaytarildi'))
    .sort((a,b)=>(b.deliveredAt||0)-(a.deliveredAt||0));
  const STATUS_LABEL = {yetkazildi:'✅ Yetkazildi', qaytarildi:'↩️ Qaytarilgan'};
  box.innerHTML = mine.map(o=>`
    <div class="sessionRow">
      <span>
        <b>${o.customerName||'Mijoz'}</b>
        <div class="smallMuted" style="font-size:11px;">${o.date?o.date.slice(0,10):''} · ${STATUS_LABEL[o.status]||o.status}</div>
        ${o.returnReason?`<div class="smallMuted" style="font-size:11px;color:var(--danger);">${o.returnReason}</div>`:''}
      </span>
      <b>${fmt(o.total||0)} so'm</b>
    </div>
  `).join('') || emptyHtml('receipt', "Hali yetkazish tarixi yo'q");
  openModal('modalCourierHistory');
}

function updateCourierSwitchUI(){
  document.getElementById('courierShareSwitch').classList.toggle('on', courierSharingOn);
  document.getElementById('courierStatusText').textContent = courierSharingOn ? "Ulashilmoqda — jonli" : "O'chirilgan";
}

async function toggleCourierSharing(){
  courierSharingOn = !courierSharingOn;
  updateCourierSwitchUI();
  if(courierSharingOn) startCourierWatch(); else stopCourierWatch();
  await courierSafeUpdateOrder(courierOrderId, o=>{ o.courierTrackingOn = courierSharingOn; });
}

function startCourierWatch(){
  if(!navigator.geolocation){ alert("Bu qurilmada joylashuvni aniqlab bo'lmaydi"); return; }
  if(courierWatchId!=null) return;
  courierWatchId = navigator.geolocation.watchPosition(pos=>{
    const now = Date.now();
    if(now - courierLastWriteTs < 5000) return;
    courierLastWriteTs = now;
    courierSafeUpdateOrder(courierOrderId, o=>{
      o.courierLat = pos.coords.latitude;
      o.courierLng = pos.coords.longitude;
      o.courierUpdatedAt = now;
    });
  }, err=>{
    console.warn('Joylashuv xatosi:', err);
  }, {enableHighAccuracy:true, maximumAge:8000});
}

function stopCourierWatch(){
  if(courierWatchId!=null){ navigator.geolocation.clearWatch(courierWatchId); courierWatchId = null; }
}

function currentDeliveryFee(){
  const sel = document.getElementById('boDeliveryZone');
  if(!sel || !sel.value) return 0;
  const zone = (state.deliveryZones||[]).find(z=>z.id===sel.value);
  return zone ? zone.price : 0;
}
