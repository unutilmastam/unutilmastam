/* Unutilmas Ta'm — 5-basket
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function pdAddToBasket(){
  if(previewBlocked()) return;
  if(!pdCurrentProduct) return;
  /* Buyurtma asosidagi mahsulot: ombor tekshirilmaydi, lekin eng kam miqdor shart */
  if(pdCurrentProduct.preorder){
    const chk = preorderCheck(pdCurrentProduct, pdQty);
    if(!chk.ok){ alert(chk.msg); return; }
  }else if(pdCurrentProduct.stock<=0){ return; }
  basket[pdCurrentProduct.id] = (basket[pdCurrentProduct.id]||0) + pdQty;
  updateBasketCount();
  closeModal('modalProductDetail');
  const navSavat = document.getElementById('nav-savat');
  if(navSavat){ navSavat.classList.add('bump'); setTimeout(()=>navSavat.classList.remove('bump'), 350); }
}

/* ============================================================
   PROMO-KODLAR — admin boshqaruvi
   ============================================================ */
function openPromoCodesModal(){
  renderPromoCodesList();
  document.getElementById('pcCode').value = '';
  document.getElementById('pcDiscount').value = '';
  document.getElementById('pcLimit').value = '';
  openModal('modalPromoCodes');
}

function renderPromoCodesList(){
  const box = document.getElementById('promoCodesList');
  const codes = state.promoCodes || [];
  box.innerHTML = codes.map(pc=>`
    <div class="sessionRow">
      <span>
        <b>${pc.code}</b> — ${pc.discountPercent}%
        <div class="smallMuted" style="font-size:11px;">
          Ishlatilgan: ${pc.usedCount||0}${pc.usageLimit?'/'+pc.usageLimit:''} ${pc.active?'':"· O'chirilgan"}
        </div>
      </span>
      <span style="display:flex;gap:6px;">
        <button class="ghostBtn" style="padding:6px 10px;font-size:11.5px;" onclick="togglePromoActive('${pc.id}')">${pc.active?"O'chirish":'Yoqish'}</button>
        <button class="ghostBtn" style="padding:6px 10px;font-size:11.5px;color:var(--danger);" onclick="deletePromoCode('${pc.id}')">O'chirish</button>
      </span>
    </div>
  `).join('') || emptyHtml('tag',"Hali promo-kod yo'q");
}

async function createPromoCode(){
  const code = document.getElementById('pcCode').value.trim().toUpperCase();
  const discount = parseFloat(document.getElementById('pcDiscount').value);
  const limit = parseInt(document.getElementById('pcLimit').value) || null;
  if(!code){ alert('Kodni kiriting'); return; }
  if(!discount || discount<=0 || discount>100){ alert("Chegirma foizini to'g'ri kiriting (1-100)"); return; }
  if(state.promoCodes.some(p=>p.code===code)){ alert('Bunday kod allaqachon mavjud'); return; }
  state.promoCodes.push({id:uid('pc'), code, discountPercent:discount, usageLimit:limit, usedCount:0, active:true, createdAt: todayISO()});
  await saveState();
  openPromoCodesModal();
}

async function togglePromoActive(id){
  const pc = state.promoCodes.find(p=>p.id===id);
  if(pc){ pc.active = !pc.active; await saveState(); renderPromoCodesList(); }
}

async function deletePromoCode(id){
  if(!confirm("Bu promo-kodni o'chirmoqchimisiz?")) return;
  state.promoCodes = state.promoCodes.filter(p=>p.id!==id);
  await saveState();
  renderPromoCodesList();
}

/* Hisobdagi pul qatori — savatda ko'rsatiladi */
function showBalanceRow(balance, used){
  const host = document.getElementById('pointsRow');
  if(!host || !host.parentElement) return;
  let row = document.getElementById('balanceRow');
  if(!balance){ if(row) row.remove(); return; }
  if(!row){
    row = document.createElement('div');
    row.id = 'balanceRow';
    row.className = 'balanceRow';
    host.parentElement.insertBefore(row, host.nextSibling);
  }
  row.innerHTML = `<span>💰 Hisobingiz: <b>${fmt(balance)} so'm</b></span>` +
                  (used ? `<b class="bUsed">−${fmt(used)}</b>` : '');
}

function updateBasketCount(){
  const count = Object.values(basket).reduce((s,q)=>s+q,0);
  const badge = document.getElementById('navBasketBadge');
  if(badge){
    badge.textContent = count;
    badge.classList.toggle('hidden', count===0);
  }
}

 // 1 ball = 100 so'm

function basketSubtotal(){
  let sum = 0;
  Object.keys(basket).forEach(pid=>{
    const p = state.products.find(x=>x.id===pid);
    if(p) sum += priceOf(p) * basket[pid];
  });
  return sum;
}

function basketUpdateTotal(){
  const subtotal = basketSubtotal();
  let afterPromo = subtotal;
  if(appliedPromoCode){
    /* chegirma faqat belgilangan donaga qo'llanadi (promo.maxItems) */
    afterPromo = Math.max(0, subtotal - promoDiscountFor(appliedPromoCode, basketItems()));
  }

  const myUser = (currentUser && currentUser.role==='user') ? state.users.find(x=>x.id===currentUser.id) : null;
  const myPoints = myUser ? (myUser.points||0) : 0;
  const pointsRow = document.getElementById('pointsRow');
  const usePointsCb = document.getElementById('usePointsCheckbox');
  if(pointsRow){
    if(myPoints > 0 && pointsOn()){
      pointsRow.classList.remove('hidden');
      const maxUsable = Math.min(myPoints, Math.floor(afterPromo/pointValue()));
      document.getElementById('pointsRowText').textContent =
        `${myPoints} ballingiz bor — ishlatilsa ${fmt(Math.min(myPoints,maxUsable)*pointValue())} so'm chegirma`;
    } else {
      pointsRow.classList.add('hidden');
    }
  }

  let pointsDiscount = 0;
  if(usePointsCb && usePointsCb.checked && myPoints>0 && pointsOn()){
    const maxPointsUsable = Math.min(myPoints, Math.floor(afterPromo/pointValue()));
    pointsDiscount = maxPointsUsable * pointValue();
  }

  /* Hisobdagi pul (bonus / referal mukofoti) — avtomatik ayiriladi */
  const afterPoints = Math.max(0, afterPromo - pointsDiscount);
  const bal = myUser ? (Number(myUser.balance) || 0) : 0;
  const balUsed = Math.min(bal, afterPoints);
  showBalanceRow(bal, balUsed);

  const finalTotal = Math.max(0, afterPoints - balUsed) + currentDeliveryFee();
  const el = document.getElementById('basketTotalSum');
  if(el) el.textContent = fmt(finalTotal) + " so'm";
  updateBasketCount();
}

function applyPromoCode(){
  const code = document.getElementById('promoInput').value.trim().toUpperCase();
  if(!code) return;
  const promo = (state.promoCodes||[]).find(p=>p.code.toUpperCase()===code);
  if(!promo){ alert("Bunday promo-kod topilmadi"); return; }
  if(!promo.active){ alert("Bu promo-kod faol emas"); return; }
  if(promo.expiresAt && new Date(promo.expiresAt) < new Date()){ alert("Bu promo-kodning muddati tugagan"); return; }
  if(promo.usageLimit && (promo.usedCount||0) >= promo.usageLimit){ alert("Bu promo-kod limiti tugagan"); return; }

  appliedPromoCode = promo;
  document.getElementById('promoRow').classList.add('hidden');
  document.getElementById('promoAppliedTag').classList.remove('hidden');
  document.getElementById('promoAppliedText').textContent = `"${promo.code}" qo'llandi — ${promo.discountPercent}% chegirma`;
  basketUpdateTotal();
}

function removePromoCode(){
  appliedPromoCode = null;
  document.getElementById('promoInput').value = '';
  document.getElementById('promoRow').classList.remove('hidden');
  document.getElementById('promoAppliedTag').classList.add('hidden');
  basketUpdateTotal();
}

function basketChangeQty(pid, d){
  const p = state.products.find(x=>x.id===pid);
  const next = (basket[pid]||0) + d;
  if(next <= 0){ delete basket[pid]; } else { basket[pid] = next; }
  renderBasketModal();
}

function basketQtyInput(pid, el){
  const n = parseInt(el.value.replace(/[^0-9]/g,''), 10);
  if(!isNaN(n) && n>0){ basket[pid] = n; basketUpdateTotal(); }
}

function basketQtyBlur(pid, el){
  let n = parseInt(el.value.replace(/[^0-9]/g,''), 10);
  if(isNaN(n) || n<1){ delete basket[pid]; renderBasketModal(); return; }
  basket[pid] = n; el.value = n;
  basketUpdateTotal();
}

function renderBasketModal(){
  if(previewBlocked()) return;
  const list = document.getElementById('basketList');
  const entries = Object.entries(basket);
  list.innerHTML = entries.map(([pid,qty])=>{
    const p = state.products.find(x=>x.id===pid);
    if(!p) return '';
    return `<div class="sessionRow basketRow">
      <span style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="prodThumbSm" style="width:30px;height:30px;flex-shrink:0;">${prodThumb(p,13)}</span>
        <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</b>
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div class="pdQtyBox" style="padding:2px;">
          <button onclick="basketChangeQty('${pid}',-1)" style="width:28px;height:28px;">${ic('minus',12)}</button>
          <input type="tel" inputmode="numeric" value="${qty}" style="width:32px;font-size:14px;" onfocus="this.select()" oninput="basketQtyInput('${pid}',this)" onblur="basketQtyBlur('${pid}',this)">
          <button onclick="basketChangeQty('${pid}',1)" style="width:28px;height:28px;">${ic('plus',12)}</button>
        </div>
        <b style="min-width:82px;text-align:right;font-size:13.5px;">${fmt(priceOf(p)*qty)} so'm</b>
      </span>
    </div>`;
  }).join('') || emptyHtml('cart','Savat bo\'sh');
  populateDeliveryZones();
  basketUpdateTotal();
  orderLat=null; orderLng=null;
  document.getElementById('boLocStatus').textContent = '';
  document.getElementById('boPersonalLocStatus').textContent = '';
  ['boStoreName','boStoreAddr','boStorePhone'].forEach(id=>document.getElementById(id).value='');
  const myU = (currentUser && currentUser.role==='user') ? state.users.find(x=>x.id===currentUser.id) : null;
  const isStoreOwner = myU && myU.userType==='store';
  // Ro'yxatdan o'tgan do'kon egasi bo'lsa — do'kon ma'lumotlari avtomatik to'ldiriladi
  setOrderType(isStoreOwner ? 'dokon' : 'shaxsiy');
  if(isStoreOwner){
    document.getElementById('boStoreName').value = myU.storeName || '';
    document.getElementById('boStoreAddr').value = myU.address || '';
    document.getElementById('boStorePhone').value = myU.contact || '';
    document.getElementById('boStoreAutoNote').classList.remove('hidden');
  } else {
    document.getElementById('boStoreAutoNote').classList.add('hidden');
  }
  if(currentUser && currentUser.role==='user'){
    const u = myU;
    document.getElementById('boPersonalName').textContent = currentUser.name;
    document.getElementById('boPersonalPhoneVal').textContent = currentUser.contact;
    document.getElementById('boPersonalPhone').value = currentUser.contact;
    document.getElementById('boUseSavedHomeBtn').classList.toggle('hidden', !(u && u.homeLat));
  }
}
