/* Unutilmas Ta'm — 22-storeledger.js
   ═══════════════════════════════════════════════════════════════
   MAGAZIN HISOBI: cheklar, qarz, egasining kabineti, BONUS

   1) Sotuv chek chiqarilganda AYNAN tanlangan magazinga bog'lanadi
      (ilgari oldingi chekdagi magazinga yozilib ketardi).
   2) Har bir chek magazin tarixida saqlanadi: sana, mahsulotlar,
      jami, to'langan, qarz.
   3) Magazin egasi o'z kabinetida hammasini ko'radi.
   4) Bonus: har bir magazin uchun alohida yoqiladi — maqsad summa
      va foiz. Maqsadga yetganda xabar chiqadi, "Bonusni berish"
      bosilganda hisob noldan boshlanadi.

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

/* ───────── Yordamchilar ───────── */
function storeById(id){ return (state.stores || []).find(s => s.id === id); }

/* Chek ichidagi mahsulotlarni ekrandan o'qiydi (tez hisob bo'lmagan cheklar uchun) */
function itemsFromReceiptDom(){
  const out = [];
  document.querySelectorAll('#crItemsList .rItemRow').forEach(function(r){
    const name = ((r.querySelector('.riName') || {}).textContent || '').trim();
    const qtyTxt = ((r.querySelector('.riQty') || {}).textContent || '');
    const m = qtyTxt.match(/[×x]\s*(\d+)/);
    const sum = parseInt(((r.querySelector('.riPrice') || {}).textContent || '').replace(/[^\d]/g, ''), 10) || 0;
    if(name) out.push({ name: name, qty: m ? parseInt(m[1], 10) : 1, sum: sum });
  });
  return out;
}

/* ───────── 1. Chek chiqarilganda: hammasini to'g'ri magazinga ───────── */
function finalizeStoreSale(storeId, total, paid, debt){
  const pend = window.__pendingSale;
  const s = storeId ? storeById(storeId) : null;
  const items = (pend && pend.items && pend.items.length) ? pend.items : itemsFromReceiptDom();
  const noEl = document.getElementById('crChekNo');
  const receiptNo = (pend && pend.receiptNo) ||
                    (noEl ? noEl.textContent.replace('#', '').trim() : '') ||
                    ('CH-' + String(Date.now()).slice(-6));

  if(!s){
    /* Magazin tanlanmagan — faqat qarz bo'lsa ham hech kimga yozib bo'lmaydi */
    return;
  }

  /* a) tez hisob sotuvlarini shu magazinga bog'lash (bir marta) */
  if(pend && !pend.linked){
    (state.sales || []).forEach(function(x){
      if(x.receiptNo === pend.receiptNo){ x.storeId = s.id; x.storeName = s.name; }
    });
    pend.linked = true;
  }

  /* b) chekni magazin tarixiga yozish (qayta chiqarilsa takrorlanmaydi) */
  state.receipts = state.receipts || [];
  let rec = state.receipts.find(r => r.no === receiptNo && r.storeId === s.id);
  if(!rec){
    rec = { id: uid('rc'), no: receiptNo, storeId: s.id, storeName: s.name,
            ts: (pend && pend.ts) || Date.now(), items: items,
            total: total, paid: paid, debt: debt };
    state.receipts.push(rec);

    /* c) qarz — mahsulotlar va chek raqami bilan */
    if(debt > 0){
      state.ledger = state.ledger || [];
      state.ledger.push({
        id: uid('l'), partyType: 'store', partyId: s.id, partyName: s.name,
        items: items.map(i => ({ name: i.name, qty: i.qty })),
        total: total, paid: paid, debt: debt,
        date: todayISO(), status: 'debt', source: 'chek', receiptNo: receiptNo
      });
    }
  }
  try{ saveState(); }catch(e){}
  try{ checkStoreBonus(s.id); }catch(e){ console.warn('Bonus:', e); }
  /* Sovg'a chizig'i — magazin egasining xaridi ham hisobga qo'shiladi */
  try{
    const ownerId = s.ownerUserId ||
      ((state.users || []).find(u => (u.storeName || '').trim().toLowerCase() === (s.name || '').trim().toLowerCase()) || {}).id;
    const q = items.reduce(function(a, i){ return a + (i.qty || 0); }, 0);
    if(ownerId && q && typeof addGiftProgress === 'function') addGiftProgress(ownerId, q);
  }catch(e){ console.warn('Sovga:', e); }
}

/* Magazin oynasi ochiq bo'lsa — yangilaydi (to'lov, tahrirlashdan keyin) */
function refreshStoreDetailIfOpen(){
  const m = document.getElementById('modalStoreDetail');
  if(!m || m.classList.contains('hidden')) return;
  if(typeof sdStoreId === 'undefined' || !sdStoreId) return;
  const s = storeById(sdStoreId);
  if(s && typeof renderStoreDetailShell === 'function') renderStoreDetailShell(s, false);
}

/* ───────── 2. BONUS ───────── */
function bonusOf(s){ return (s && s.bonus) || null; }

/* Joriy davrdagi savdo (oxirgi bonus berilgandan beri) */
function bonusPeriodSales(storeId){
  const s = storeById(storeId), b = bonusOf(s);
  if(!b) return 0;
  const since = b.since || 0;
  return storeSales(storeId).filter(r => (r.ts || 0) >= since)
                            .reduce((a, r) => a + (r.total || 0), 0);
}

function bonusAmount(b){ return Math.round((b.target || 0) * (b.pct || 0) / 100); }

function bonusState(storeId){
  const s = storeById(storeId), b = bonusOf(s);
  if(!b || !b.on) return null;
  const sales = bonusPeriodSales(storeId);
  return { b: b, sales: sales, pct: Math.min(100, Math.round(sales / Math.max(1, b.target) * 100)),
           reached: sales >= b.target, amount: bonusAmount(b) };
}

/* Maqsadga yetganda — bir marta xabar beradi */
function checkStoreBonus(storeId){
  const st = bonusState(storeId);
  if(!st || !st.reached) return;
  const s = storeById(storeId);
  if(st.b.notifiedSince === st.b.since) return;           // bu davr uchun xabar berilgan
  st.b.notifiedSince = st.b.since;
  const title = '🎁 Bonus: ' + s.name;
  const body = s.name + ' savdosi ' + fmt(st.b.target) + " so'mga yetdi. " +
               st.b.pct + '% bonus: ' + fmt(st.amount) + " so'm.";
  try{ pushNotification('admin', title, body, 'bonus', { storeId: storeId }); }catch(e){}
  try{ saveState(); }catch(e){}
  if(currentUser && currentUser.role === 'admin'){
    setTimeout(function(){ alert(title + '\n\n' + body); }, 400);
  }
}

function bonusCardHtml(storeId){
  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  const s = storeById(storeId), b = bonusOf(s);
  if(!b || !b.on){
    return isAdmin ? `<button class="ghostBtn bonusSetBtn" onclick="openBonusSettings('${storeId}')">🎁 Bonus funksiyasini yoqish</button>` : '';
  }
  const st = bonusState(storeId);
  const hist = (b.history || []).slice(-3).reverse().map(h =>
    `<div class="bnHist"><span>${new Date(h.ts).toLocaleDateString('uz-UZ')}</span><b>${fmt(h.amount)} so'm</b></div>`).join('');
  return `
    <div class="bonusCard ${st.reached ? 'ready' : ''}">
      <div class="bnHead">
        <span>🎁 Bonus · ${b.pct}% · maqsad ${fmt(b.target)}</span>
        ${isAdmin ? `<button class="bnEdit" onclick="openBonusSettings('${storeId}')">Sozlash</button>` : ''}
      </div>
      <div class="bnBar"><i style="width:${st.pct}%"></i></div>
      <div class="bnNums"><b>${fmt(st.sales)}</b><span>/ ${fmt(b.target)} so'm · ${st.pct}%</span></div>
      ${st.reached ? `
        <div class="bnReady">Maqsadga yetdi! Bonus: <b>${fmt(st.amount)} so'm</b></div>
        ${isAdmin ? `<button class="primaryBtn" style="width:100%;margin-top:8px;" onclick="payStoreBonus('${storeId}')">Bonusni berish</button>` : ''}`
      : `<div class="bnLeft">Yana ${fmt(Math.max(0, b.target - st.sales))} so'm savdo qolgan</div>`}
      ${b.card ? `<div class="bnCard">Karta: <b>${b.card}</b></div>` : ''}
      ${hist ? `<div class="bnHistT">Berilgan bonuslar</div>${hist}` : ''}
    </div>`;
}

let bonusEditStoreId = '';
function openBonusSettings(storeId){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const s = storeById(storeId); if(!s) return;
  bonusEditStoreId = storeId;
  const b = s.bonus || {};
  document.getElementById('bnWho').textContent = s.name;
  document.getElementById('bnOn').checked = !!b.on;
  document.getElementById('bnTarget').value = b.target ? fmt(b.target) : '5 000 000';
  document.getElementById('bnPct').value = b.pct != null ? b.pct : 2;
  document.getElementById('bnCardNo').value = b.card || '';
  updateBonusPreview();
  openModal('modalBonus');
}

function updateBonusPreview(){
  const t = parseMoney(document.getElementById('bnTarget').value);
  const p = parseFloat(String(document.getElementById('bnPct').value).replace(',', '.')) || 0;
  document.getElementById('bnPreview').textContent =
    fmt(t) + " so'm savdoda bonus: " + fmt(Math.round(t * p / 100)) + " so'm";
}

async function saveBonusSettings(){
  const s = storeById(bonusEditStoreId); if(!s) return;
  const on = document.getElementById('bnOn').checked;
  const target = parseMoney(document.getElementById('bnTarget').value);
  const pct = parseFloat(String(document.getElementById('bnPct').value).replace(',', '.')) || 0;
  if(on && (!target || !pct)){ alert("Maqsad summa va foizni kiriting."); return; }
  const prev = s.bonus || {};
  s.bonus = Object.assign({}, prev, {
    on: on, target: target, pct: pct,
    card: document.getElementById('bnCardNo').value.trim(),
    /* birinchi marta yoqilganda hisob shu kundan boshlanadi */
    since: prev.since || Date.now(),
    history: prev.history || []
  });
  await saveState();
  closeModal('modalBonus');
  refreshStoreDetailIfOpen();
  checkStoreBonus(s.id);
}

function payStoreBonus(storeId){
  const s = storeById(storeId), st = bonusState(storeId);
  if(!s || !st || !st.reached) return;
  /* Ikki yo'l: kartaga o'tkazish yoki keyingi xaridga yozib qo'yish */
  openTallyConfirm({
    title: 'Bonus qanday beriladi?',
    text: '<b>' + s.name + '</b> — ' + st.b.pct + '% bonus<br><br>' +
          (st.b.card ? 'Karta: <b>' + st.b.card + '</b><br><br>' : '') +
          "<b>Kartaga</b> — pulni o'zingiz o'tkazasiz.<br>" +
          "<b>Keyingi xaridga</b> — magazin hisobiga yoziladi va keyingi buyurtmadan ayiriladi.",
    sum: fmt(st.amount) + " so'm",
    okText: 'KARTAGA BERDIM',
    noText: 'KEYINGI XARIDGA',
    onNo: function(){ giveBonusAsCredit(storeId); },
    onOk: async function(){
      st.b.history = st.b.history || [];
      st.b.history.push({ ts: Date.now(), amount: st.amount, sales: st.sales,
                          target: st.b.target, pct: st.b.pct, method: 'karta' });
      st.b.since = Date.now();                 // yangi davr — shu daqiqadan
      st.b.notifiedSince = null;
      await saveState();
      try{ pushNotification('admin', '🎁 Bonus berildi', s.name + ': ' + fmt(st.amount) + " so'm", 'bonus', {storeId: storeId}); }catch(e){}
      refreshStoreDetailIfOpen();
    }
  });
}

/* ───────── 3. Magazin profili: bonus + cheklar ───────── */
function receiptsHtml(storeId){
  const list = (state.receipts || []).filter(r => r.storeId === storeId)
                                     .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  if(!list.length) return '';
  return `<div class="rcTitle">Cheklar</div>` + list.map(function(r){
    const items = (r.items || []).map(i => i.name + ' ×' + i.qty).join(', ');
    return `<div class="rcRow">
      <div class="rcTop"><span>#${r.no}</span><b>${fmt(r.total)} so'm</b></div>
      <div class="rcMeta">${new Date(r.ts).toLocaleString('uz-UZ')}</div>
      ${items ? `<div class="rcItems">${items}</div>` : ''}
      <div class="rcPay"><span>To'landi: <b>${fmt(r.paid)}</b></span>
        ${r.debt > 0 ? `<span class="rcDebt">Qarz: <b>${fmt(r.debt)}</b></span>` : `<span class="rcOk">To'liq to'langan</span>`}</div>
    </div>`;
  }).join('');
}

(function(){
  if(typeof storeSalesHtml !== 'function') return;
  const orig = storeSalesHtml;
  storeSalesHtml = function(storeId){
    return bonusCardHtml(storeId) + orig(storeId) + receiptsHtml(storeId);
  };
})();

/* ───────── 4. Magazin egasining kabineti ───────── */
function ownerStoreIds(){
  if(!currentUser) return [];
  const me = (state.users || []).find(u => u.id === currentUser.id) || {};
  const nm = (me.storeName || '').trim().toLowerCase();
  const ids = (state.stores || []).filter(function(s){
    return s.ownerUserId === currentUser.id ||
           (nm && (s.name || '').trim().toLowerCase() === nm);
  }).map(s => s.id);
  (state.orders || []).forEach(function(o){
    if(o.userId === currentUser.id && o.storeId && ids.indexOf(o.storeId) === -1) ids.push(o.storeId);
  });
  return ids;
}

function ownerCabinetHtml(){
  const ids = ownerStoreIds();
  if(!ids.length) return '';
  const rec = (state.receipts || []).filter(r => ids.indexOf(r.storeId) !== -1);
  const totalBuy = rec.reduce((a, r) => a + (r.total || 0), 0);
  const totalPaid = rec.reduce((a, r) => a + (r.paid || 0), 0);
  const debt = ids.reduce((a, id) => a + storeDebt(id), 0);
  const bonuses = (typeof bonusEnabled === 'function' && !bonusEnabled())
    ? '' : ids.map(id => bonusCardHtml(id)).join('');

  return `
    <div class="card ownerBox">
      <div class="cardTitle">Magazin hisobim</div>
      <div class="ssStats">
        <div><span>${fmt(totalBuy)}</span><label>Jami xarid</label></div>
        <div><span>${fmt(totalPaid)}</span><label>To'langan</label></div>
        <div><span class="${debt > 0 ? 'lossSum' : ''}">${fmt(debt)}</span><label>Qarz</label></div>
      </div>
      ${bonuses}
      ${ids.map(id => receiptsHtml(id)).join('') ||
        `<p class="smallMuted" style="text-align:center;margin:10px 0 2px;">Hali chek yo'q</p>`}
    </div>`;
}

/* ── Do'kon egasi o'z "Profil" oynasida qo'shimcha telefon raqam
   qo'sha/o'chira oladi (asosiy raqamni faqat admin o'zgartiradi) ── */
let pfPhoneStoreId = null;

function pfPhonesBoxHtml(storeId){
  const s = (state.stores || []).find(x => x.id === storeId);
  if(!s) return '';
  const rows = phoneCallRowsHtml(s.phone, s.extraPhones, 'ownerRemovePhone');
  return `
    <div class="pfPhonesSection">
      <div class="pfPhonesTitle">Telefon raqamlarim</div>
      ${rows || '<p class="smallMuted" style="margin:4px 0 8px;">Hali raqam kiritilmagan</p>'}
      <div class="pfPhoneAddRow">
        <input id="pfNewPhone" placeholder="+998 90 000 00 00" autocomplete="off">
        <button type="button" class="ghostBtn" onclick="ownerAddPhone()">${ic('plus',14)}Qo'shish</button>
      </div>
    </div>`;
}

function ownerAddPhone(){
  const inp = document.getElementById('pfNewPhone');
  const val = (inp && inp.value || '').trim();
  if(!val){ if(inp) inp.focus(); return; }
  const s = (state.stores || []).find(x => x.id === pfPhoneStoreId);
  if(!s) return;
  s.extraPhones = s.extraPhones || [];
  s.extraPhones.push(val);
  saveState();
  const box = document.getElementById('pfPhonesBox');
  if(box) box.innerHTML = pfPhonesBoxHtml(pfPhoneStoreId);
}

function ownerRemovePhone(idx){
  const s = (state.stores || []).find(x => x.id === pfPhoneStoreId);
  if(!s || !s.extraPhones) return;
  s.extraPhones.splice(idx, 1);
  saveState();
  const box = document.getElementById('pfPhonesBox');
  if(box) box.innerHTML = pfPhonesBoxHtml(pfPhoneStoreId);
}

(function(){
  if(typeof openProfileModal !== 'function') return;
  const origPf = openProfileModal;
  openProfileModal = function(){
    origPf.apply(this, arguments);
    try{
      const box = document.getElementById('pfPhonesBox');
      if(!box) return;
      const u = (state.users || []).find(x => x.id === (currentUser||{}).id);
      if(!u || u.userType !== 'store'){ box.innerHTML = ''; pfPhoneStoreId = null; return; }
      const ids = ownerStoreIds();
      pfPhoneStoreId = ids[0] || null;
      box.innerHTML = pfPhoneStoreId ? pfPhonesBoxHtml(pfPhoneStoreId) : '';
    }catch(e){ console.warn('Profil telefon:', e); }
  };
})();

(function(){
  if(typeof renderCabinet !== 'function') return;
  const orig = renderCabinet;
  renderCabinet = function(){
    orig.apply(this, arguments);
    try{
      const card = document.getElementById('custProfileCard');
      if(!card || !currentUser || currentUser.role === 'admin') return;
      let box = document.getElementById('ownerStoreBox');
      if(!box){
        box = document.createElement('div');
        box.id = 'ownerStoreBox';
        card.parentNode.insertBefore(box, card.nextSibling);
      }
      box.innerHTML = ownerCabinetHtml();

      /* qarzlar ro'yxati — endi egasining magazinlari bo'yicha ham */
      const ids = ownerStoreIds();
      const debts = (state.ledger || []).filter(l => l.partyType === 'store' && ids.indexOf(l.partyId) !== -1).reverse();
      const dl = document.getElementById('custDebtList');
      if(dl && debts.length) dl.innerHTML = debts.map(l => ledgerRowHtml(l, false)).join('');
      const top = document.getElementById('custMyDebt');
      if(top && ids.length) top.textContent = fmt(ids.reduce((a, id) => a + storeDebt(id), 0));
    }catch(e){ console.warn('Kabinet:', e); }
  };
})();


/* Bonusni keyingi xaridga yozish — magazin egasining hisobiga */
async function giveBonusAsCredit(storeId){
  const s = storeById(storeId), st = bonusState(storeId);
  if(!s || !st || !st.reached) return;
  const ownerId = s.ownerUserId ||
    ((state.users || []).find(u => (u.storeName || '').trim().toLowerCase() === (s.name || '').trim().toLowerCase()) || {}).id;
  if(!ownerId){
    alert("Bu magazinning egasi ilovada ro'yxatdan o'tmagan.\n\nHisobga yozib bo'lmaydi — kartaga o'tkazing.");
    return;
  }
  st.b.history = st.b.history || [];
  st.b.history.push({ ts: Date.now(), amount: st.amount, sales: st.sales,
                      target: st.b.target, pct: st.b.pct, method: 'hisob' });
  st.b.since = Date.now();
  st.b.notifiedSince = null;
  await addBalance(ownerId, st.amount, 'Bonus — ' + s.name);
  try{ pushNotification('admin', '🎁 Bonus hisobga yozildi',
        s.name + ': ' + fmt(st.amount) + " so'm keyingi xaridga", 'bonus', {storeId: storeId}); }catch(e){}
  refreshStoreDetailIfOpen();
}
