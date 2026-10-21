/* Unutilmas Ta'm — 23-debtguard.js
   ═══════════════════════════════════════════════════════════════
   QARZ HIMOYASI

   Muammo: qarz tafsiloti oynasidagi "Tahrirlash", "To'lov qabul
   qilish", "Xabar yuborish" tugmalari HAMMAGA ko'rinardi va ularning
   hech biri admin ekanini tekshirmasdi. Magazin egasi o'z qarzini
   tahrirlab, o'chirib yoki pul bermasdan "to'landi" qilib qo'ya olardi.

   Yechim:
   1) qarz bilan ishlaydigan barcha funksiyalar FAQAT admin uchun —
      tugma yashirilishi yetarli emas, funksiyaning o'zi ham to'sadi
   2) magazin egasi faqat "To'lov qildim" SO'ROVINI yuboradi —
      qarz faqat admin TASDIQLAGANDA kamayadi

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

function isAdminUser(){ return !!(currentUser && currentUser.role === 'admin'); }

/* ───────── 1. Funksiyalarni himoyalash ─────────
   Inline onclick nomi orqali chaqiradi — shuning uchun globalni
   o'rab qo'yish hamma joyni qamraydi. */
const ADMIN_ONLY = [
  'openEditLedger', 'confirmEditLedger', 'deleteLedger',
  'openPay', 'confirmPay', 'openDebtMessageModal',
  'openAddDebt', 'saveAddDebt',
  'openBonusSettings', 'saveBonusSettings', 'payStoreBonus'
];

ADMIN_ONLY.forEach(function(name){
  const f = window[name];
  if(typeof f !== 'function') return;
  window[name] = function(){
    if(!isAdminUser()){
      alert("Bu amal faqat administrator uchun.");
      return;
    }
    return f.apply(this, arguments);
  };
});

/* ───────── 2. To'lov so'rovlari ───────── */
function payReqs(){ return state.payRequests = state.payRequests || []; }

function pendingForLedger(ledgerId){
  return payReqs().filter(r => r.ledgerId === ledgerId && r.status === 'pending');
}

function pendingForStore(storeId){
  return payReqs().filter(r => r.storeId === storeId && r.status === 'pending');
}

let payReqLedgerId = '';

function openPayRequest(ledgerId){
  if(!currentUser) return;
  const l = (state.ledger || []).find(x => x.id === ledgerId);
  if(!l || !(l.debt > 0)) return;
  payReqLedgerId = ledgerId;
  document.getElementById('prqWho').textContent = l.partyName || '';
  document.getElementById('prqDebt').textContent = fmt(l.debt) + " so'm";
  document.getElementById('prqAmount').value = fmt(l.debt);
  document.getElementById('prqNote').value = '';
  document.querySelectorAll('#prqMethods button').forEach((b, i) => b.classList.toggle('on', i === 0));
  document.getElementById('prqErr').classList.add('hidden');
  openModal('modalPayRequest');
}

function pickPayMethod(btn){
  document.querySelectorAll('#prqMethods button').forEach(b => b.classList.toggle('on', b === btn));
}

async function submitPayRequest(){
  const l = (state.ledger || []).find(x => x.id === payReqLedgerId);
  if(!l) return;
  const amount = Math.min(l.debt, parseMoney(document.getElementById('prqAmount').value));
  const err = document.getElementById('prqErr');
  if(!amount){ err.textContent = "To'lov summasini yozing."; err.classList.remove('hidden'); return; }
  const m = document.querySelector('#prqMethods button.on');

  payReqs().push({
    id: uid('pr'), ledgerId: l.id, storeId: l.partyId, partyName: l.partyName,
    amount: amount, method: m ? m.getAttribute('data-m') : 'naqd',
    note: document.getElementById('prqNote').value.trim(),
    userId: currentUser.id, userName: currentUser.name || '',
    ts: Date.now(), status: 'pending'
  });
  await saveState();
  try{
    pushNotification('admin', "💳 To'lov so'rovi: " + (l.partyName || ''),
      (currentUser.name || '') + ' ' + fmt(amount) + " so'm to'laganini bildirdi. Tasdiqlang.",
      'payRequest', { ledgerId: l.id, storeId: l.partyId });
  }catch(e){}
  closeModal('modalPayRequest');
  closeModal('modalLedgerDetail');
  alert("So'rov yuborildi. Administrator tasdiqlagach qarz kamayadi.");
  try{ renderCabinet(); }catch(e){}
}

/* Admin: tasdiqlash — qarz shu yerda kamayadi */
async function approvePayRequest(reqId){
  if(!isAdminUser()) return;
  const r = payReqs().find(x => x.id === reqId);
  if(!r || r.status !== 'pending') return;
  let left = r.amount;

  /* avval so'ralgan qarzdan, ortig'i shu magazinning boshqa qarzlaridan */
  const first = (state.ledger || []).find(x => x.id === r.ledgerId);
  const rows = (state.ledger || []).filter(x => x.partyType === 'store' && x.partyId === r.storeId && x.debt > 0 && x !== first)
                                    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  [first].concat(rows).forEach(function(l){
    if(!l || left <= 0 || !(l.debt > 0)) return;
    const pay = Math.min(left, l.debt);
    l.paid = (l.paid || 0) + pay; l.debt -= pay; left -= pay;
    if(l.debt <= 0) l.status = 'paid';
  });

  r.status = 'approved'; r.decidedAt = Date.now();
  await saveState();
  try{ pushNotification(r.userId, "✅ To'lov tasdiqlandi", fmt(r.amount) + " so'm qabul qilindi.", 'payRequest', {ledgerId: r.ledgerId}); }catch(e){}
  try{ renderDebtsAdmin(); renderStores(); renderDash(); }catch(e){}
  refreshStoreDetailIfOpen();
}

async function rejectPayRequest(reqId){
  if(!isAdminUser()) return;
  const r = payReqs().find(x => x.id === reqId);
  if(!r || r.status !== 'pending') return;
  r.status = 'rejected'; r.decidedAt = Date.now();
  await saveState();
  try{ pushNotification(r.userId, "To'lov tasdiqlanmadi", fmt(r.amount) + " so'm to'lov topilmadi. Administrator bilan bog'laning.", 'payRequest', {ledgerId: r.ledgerId}); }catch(e){}
  refreshStoreDetailIfOpen();
}

const PAY_METHODS = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };

function payReqRowHtml(r, forAdmin){
  return `<div class="prqRow">
    <div class="prqTop"><b>${fmt(r.amount)} so'm</b><span>${PAY_METHODS[r.method] || r.method}</span></div>
    <div class="prqMeta">${new Date(r.ts).toLocaleString('uz-UZ')}${r.userName ? ' · ' + r.userName : ''}</div>
    ${r.note ? `<div class="prqNote">${r.note}</div>` : ''}
    ${forAdmin ? `<div class="prqBtns">
        <button class="tcOk" onclick="approvePayRequest('${r.id}')">TASDIQLASH</button>
        <button class="tcNo" onclick="rejectPayRequest('${r.id}')">RAD ETISH</button>
      </div>` : `<div class="prqWait">Tasdiq kutilmoqda</div>`}
  </div>`;
}

/* ───────── 3. Qarz tafsiloti: rolga qarab tugmalar ───────── */
(function(){
  if(typeof openLedgerDetail !== 'function') return;
  const orig = openLedgerDetail;
  openLedgerDetail = function(ledgerId){
    orig.apply(this, arguments);
    const body = document.getElementById('ledgerDetailBody');
    const l = (state.ledger || []).find(x => x.id === ledgerId);
    if(!body || !l) return;
    const pend = pendingForLedger(ledgerId);

    if(!isAdminUser()){
      /* magazin egasi: tahrirlash / to'lov qabul / xabar tugmalari OLIB TASHLANADI */
      body.querySelectorAll('button').forEach(function(b){
        const oc = b.getAttribute('onclick') || '';
        if(/openPay\(|openEditLedger\(|openDebtMessageModal\(/.test(oc)) b.remove();
      });
      const box = document.createElement('div');
      box.className = 'prqBox';
      box.innerHTML = (pend.length
          ? `<div class="prqTitle">Yuborilgan so'rovlar</div>` + pend.map(r => payReqRowHtml(r, false)).join('')
          : '') +
        (l.debt > 0 ? `<button class="primaryBtn" style="width:100%;margin-top:8px;" onclick="openPayRequest('${l.id}')">To'lov qildim</button>
          <p class="smallMuted" style="font-size:11.5px;text-align:center;margin:7px 0 0;">
            Administrator tasdiqlagach qarz kamayadi</p>` : '');
      body.appendChild(box);
    }else if(pend.length){
      const box = document.createElement('div');
      box.className = 'prqBox';
      box.innerHTML = `<div class="prqTitle">To'lov so'rovlari</div>` + pend.map(r => payReqRowHtml(r, true)).join('');
      body.insertBefore(box, body.firstChild);
    }
  };
})();

/* Admin: magazin profilida kutilayotgan so'rovlar tepada */
(function(){
  if(typeof storeSalesHtml !== 'function') return;
  const orig = storeSalesHtml;
  storeSalesHtml = function(storeId){
    const pend = isAdminUser() ? pendingForStore(storeId) : [];
    const top = pend.length
      ? `<div class="prqBox"><div class="prqTitle">To'lov so'rovlari (${pend.length})</div>` +
        pend.map(r => payReqRowHtml(r, true)).join('') + `</div>` : '';
    return top + orig(storeId);
  };
})();

/* Egasining kabinetidagi qarz ro'yxatida ham "tahrirlash" tugmasi chiqmasin */
(function(){
  if(typeof ledgerRowHtml !== 'function') return;
  const orig = ledgerRowHtml;
  ledgerRowHtml = function(l, editable){
    return orig(l, editable && isAdminUser());
  };
})();
