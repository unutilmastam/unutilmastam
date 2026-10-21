/* Unutilmas Ta'm — 18-storepick.js
   ═══════════════════════════════════════════════════════════════
   MAGAZIN TANLASH VA QARZ HISOBI

   1) Chek chiqarishda magazin nomini qo'lda yozish o'rniga
      saqlangan magazinlar ro'yxatidan tanlash (qidiruv bilan).
   2) Har bir magazinning qarzi ro'yxatda ko'rinadi.
   3) Sotuv o'sha magazinga bog'lanadi va uning profilida
      ko'rinadi: savdo tarixi, oylik aylanma, qarzdorlik.

   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang.
   ═══════════════════════════════════════════════════════════════ */

let pickedStoreId = '';          // chek uchun tanlangan magazin

/* ───────── Magazin bo'yicha hisob ───────── */

/* Magazinning umumiy qarzi */
function storeDebt(storeId){
  return (state.ledger || [])
    .filter(l => l.partyType === 'store' && l.partyId === storeId && (l.debt || 0) > 0)
    .reduce((s, l) => s + (l.debt || 0), 0);
}

/* Magazinning barcha savdosi (tez hisob + buyurtmalar) */
function storeSales(storeId){
  const out = [];

  (state.sales || []).forEach(function(s){
    if(s.storeId === storeId){
      out.push({ ts: s.ts, total: s.total != null ? s.total : (s.price || 0),
                 qty: s.qty || 1, name: s.productName || '', src: 'Тез ҳисоб',
                 receiptNo: s.receiptNo || '' });
    }
  });

  (state.orders || []).forEach(function(o){
    if(o.storeId === storeId && o.total){
      out.push({ ts: o.ts || Date.parse(o.date || '') || 0, total: o.total,
                 qty: (o.items || []).reduce((a,i)=>a+(i.qty||0),0),
                 name: (o.items || []).map(i=>i.name).join(', '),
                 src: 'Buyurtma', receiptNo: o.id });
    }
  });

  return out.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
}

/* Oxirgi 30 kunlik aylanma */
function storeMonthStats(storeId){
  const from = Date.now() - 30 * 86400000;
  const rows = storeSales(storeId).filter(r => (r.ts || 0) >= from);
  return {
    count: rows.length,
    qty:   rows.reduce((s,r) => s + (r.qty || 0), 0),
    sum:   rows.reduce((s,r) => s + (r.total || 0), 0)
  };
}

/* ───────── Tanlash ro'yxati ───────── */
function openStorePicker(){
  const inp = document.getElementById('spSearch');
  if(inp) inp.value = '';
  renderStorePickList('');
  openModal('modalStorePick');
  setTimeout(function(){ try{ inp && inp.focus(); }catch(e){} }, 300);
}

function renderStorePickList(q){
  const box = document.getElementById('spList');
  if(!box) return;
  const query = (q || '').trim().toLowerCase();

  let list = (state.stores || []).slice();
  if(query){
    /* Avval BOSHLANISHI mos kelganlar — "a" yozilsa "a" bilan
       boshlanadiganlar chiqadi. Ular bo'lmasa, ichida bor bo'lganlar. */
    const starts = list.filter(function(s){
      return (s.name || '').toLowerCase().indexOf(query) === 0 ||
             (ownerNameOf(s) || '').toLowerCase().indexOf(query) === 0;
    });
    list = starts.length ? starts : list.filter(function(s){
      return (s.name || '').toLowerCase().includes(query) ||
             (ownerNameOf(s) || '').toLowerCase().includes(query);
    });
  }
  /* Qarzi borlar tepada */
  list.sort(function(a,b){ return storeDebt(b.id) - storeDebt(a.id); });

  if(!list.length){
    box.innerHTML = emptyHtml('store', query ? 'Topilmadi' : "Magazin yo'q");
    return;
  }

  box.innerHTML = list.map(function(s){
    const debt = storeDebt(s.id);
    const m = storeMonthStats(s.id);
    const owner = ownerNameOf(s);
    return `
    <button class="spRow" onclick="pickStore('${s.id}')">
      <div class="spMain">
        <div class="spName">${s.name}</div>
        <div class="spMeta">${owner ? owner + ' · ' : ''}oyda ${m.count} savdo · ${fmt(m.sum)} so'm</div>
      </div>
      <div class="spDebt ${debt > 0 ? 'has' : 'ok'}">
        ${debt > 0 ? '−' + fmt(debt) : "Qarz yo'q"}
      </div>
    </button>`;
  }).join('');
}

/* Do'kon egasining ismi */
function ownerNameOf(s){
  if(!s) return '';
  if(s.ownerName) return s.ownerName;
  const u = (state.users || []).find(x => x.id === s.ownerUserId || x.storeName === s.name);
  return u ? u.name : '';
}

function pickStore(storeId){
  const s = (state.stores || []).find(x => x.id === storeId);
  if(!s) return;
  pickedStoreId = storeId;
  const inp = document.getElementById('prnShopName');
  if(inp) inp.value = s.name;
  closeModal('modalStorePick');

  /* Qarzi bo'lsa eslatib qo'yamiz */
  const debt = storeDebt(storeId);
  const note = document.getElementById('prnDebtNote');
  if(note){
    if(debt > 0){
      note.innerHTML = 'Bu magazinda <b>' + fmt(debt) + " so'm</b> qarz bor.";
      note.classList.remove('hidden');
    }else{
      note.classList.add('hidden');
    }
  }
}

/* ───────── Sotuvni magazinga bog'lash ───────── */

/* tallyDoSell tugagach chaqiriladi — oxirgi sotuvlarga magazin qo'shiladi */
function linkLastSaleToStore(count, receiptNo){
  if(!pickedStoreId || !count) return;
  const s = (state.stores || []).find(x => x.id === pickedStoreId);
  const arr = state.sales || [];
  for(let i = arr.length - 1, n = 0; i >= 0 && n < count; i--, n++){
    arr[i].storeId = pickedStoreId;
    arr[i].storeName = s ? s.name : '';
    if(receiptNo) arr[i].receiptNo = receiptNo;
  }
}

/* ───────── Magazin profilidagi savdo bo'limi ───────── */
function storeSalesHtml(storeId){
  const rows = storeSales(storeId);
  const m = storeMonthStats(storeId);
  const debt = storeDebt(storeId);

  const list = rows.slice(0, 40).map(function(r){
    const d = r.ts ? new Date(r.ts) : null;
    return `
    <div class="ssRow">
      <div class="ssMain">
        <div class="ssName">${r.name || '—'}</div>
        <div class="ssMeta">${d ? d.toLocaleDateString('uz-UZ') : ''} · ${r.src}${
          r.qty ? ' · ' + r.qty + ' dona' : ''}</div>
      </div>
      <div class="ssSum">${fmt(r.total)}</div>
    </div>`;
  }).join('');

  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  const addBtn = isAdmin
    ? `<button class="ghostBtn debtAddBtn" onclick="openAddDebt('${storeId}')">+ Qarz yozish</button>`
    : '';

  return `
    ${addBtn}
    <div class="ssStats">
      <div><span>${m.count}</span><label>Oyda savdo</label></div>
      <div><span>${fmt(m.sum)}</span><label>Oylik aylanma</label></div>
      <div><span class="${debt > 0 ? 'lossSum' : ''}">${debt > 0 ? fmt(debt) : '0'}</span><label>Qarz</label></div>
    </div>
    ${rows.length
      ? `<div class="ssList">${list}</div>`
      : `<p class="smallMuted" style="text-align:center;margin:14px 0;">Savdo yozuvi yo'q</p>`}`;
}


/* ═══════════════════════════════════════════════════════════════
   YOZISH PAYTIDA QIDIRUV
   Maydonga yozilganda mos magazinlar darhol pastda chiqadi.
   ═══════════════════════════════════════════════════════════════ */
function onShopNameInput(val){
  const box = document.getElementById('shopSuggest');
  if(!box) return;
  const q = (val || '').trim().toLowerCase();

  /* Qo'lda yozilsa oldingi tanlov bekor bo'ladi */
  const cur = (state.stores || []).find(x => x.id === pickedStoreId);
  if(!cur || (cur.name || '').toLowerCase() !== q) pickedStoreId = '';

  if(!q){ box.classList.add('hidden'); box.innerHTML = ''; return; }

  let list = (state.stores || []).filter(function(s){
    return (s.name || '').toLowerCase().indexOf(q) === 0 ||
           (ownerNameOf(s) || '').toLowerCase().indexOf(q) === 0;
  });
  if(!list.length){
    list = (state.stores || []).filter(function(s){
      return (s.name || '').toLowerCase().includes(q) ||
             (ownerNameOf(s) || '').toLowerCase().includes(q);
    });
  }
  list = list.slice(0, 6);

  if(!list.length){
    box.innerHTML = '<div class="ssEmpty">Topilmadi — yangi nom sifatida yoziladi</div>';
    box.classList.remove('hidden');
    return;
  }
  box.innerHTML = list.map(function(s){
    const d = storeDebt(s.id);
    return `<button type="button" class="ssItem" onclick="pickStoreInline('${s.id}')">
      <span class="ssiName">${s.name}</span>
      <span class="ssiDebt ${d > 0 ? 'has' : ''}">${d > 0 ? '−' + fmt(d) : ''}</span>
    </button>`;
  }).join('');
  box.classList.remove('hidden');
}

function pickStoreInline(storeId){
  pickStore(storeId);
  const box = document.getElementById('shopSuggest');
  if(box){ box.classList.add('hidden'); box.innerHTML = ''; }
}

/* ═══════════════════════════════════════════════════════════════
   TO'LOV: jami — to'landi = qarz
   ═══════════════════════════════════════════════════════════════ */
let prnTotal = 0;

/* Chekdagi jami summani raqam sifatida o'qiydi */
function readReceiptTotal(captureId){
  const id = captureId === 'receiptCapture' ? 'rTotalAmt' : 'crTotalAmt';
  const el = document.getElementById(id);
  if(!el) return 0;
  const n = parseInt(String(el.textContent).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parseMoney(v){
  const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function setupPaymentBox(captureId){
  prnTotal = readReceiptTotal(captureId);
  const t = document.getElementById('prnTotal');
  if(t) t.textContent = fmt(prnTotal) + " so'm";
  const p = document.getElementById('prnPaid');
  if(p) p.value = fmt(prnTotal);           // odatda to'liq to'lanadi
  updateDebtView();
}

function onPaidInput(el){
  /* Yozilganda raqamni chiroyli ko'rsatamiz: 50000 -> 50 000 */
  const n = parseMoney(el.value);
  const pos = el.value.length - el.selectionStart;
  el.value = n ? fmt(n) : '';
  try{ const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p); }catch(e){}
  updateDebtView();
}

function setPaidAll(){
  const p = document.getElementById('prnPaid');
  if(p) p.value = fmt(prnTotal);
  updateDebtView();
}

function setPaidNone(){
  const p = document.getElementById('prnPaid');
  if(p) p.value = '';
  updateDebtView();
}

function currentPaid(){
  return Math.min(prnTotal, parseMoney((document.getElementById('prnPaid') || {}).value));
}

function updateDebtView(){
  const paid = currentPaid();
  const debt = Math.max(0, prnTotal - paid);
  const d = document.getElementById('prnDebt');
  const row = document.getElementById('prnDebtRow');
  if(d) d.textContent = fmt(debt) + " so'm";
  if(row) row.classList.toggle('has', debt > 0);
}

/* To'lovni chekka yozadi */
function applyPaymentToReceipt(paid, debt){
  [['cr','crPayBlock'], ['r','rPayBlock']].forEach(function(p){
    const block = document.getElementById(p[1]);
    if(!block) return;
    /* To'liq to'langan bo'lsa qatorlar ko'rsatilmaydi — chek toza */
    block.classList.toggle('hidden', debt <= 0);
    const pa = document.getElementById(p[0] + 'PaidAmt');
    const de = document.getElementById(p[0] + 'DebtAmt');
    if(pa) pa.textContent = fmt(paid) + " so'm";
    if(de) de.textContent = fmt(debt) + " so'm";
  });
}

/* Qarzni magazin hisobiga yozadi */
function recordStoreDebt(storeId, total, paid, debt){
  if(!storeId || debt <= 0) return;
  const s = (state.stores || []).find(x => x.id === storeId);
  state.ledger = state.ledger || [];
  state.ledger.push({
    id: uid('l'), partyType: 'store', partyId: storeId,
    partyName: s ? s.name : '',
    total: total, paid: paid, debt: debt,
    date: todayISO(), status: 'debt', source: 'chek'
  });
  try{ saveState(); }catch(e){}
}


/* ═══════════════════════════════════════════════════════════════
   QARZNI QO'LDA YOZISH
   Magazin profilidan: summa + izoh -> magazin hisobiga yoziladi.
   ═══════════════════════════════════════════════════════════════ */
let addDebtStoreId = '';

function openAddDebt(storeId){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const s = (state.stores || []).find(x => x.id === storeId);
  if(!s) return;
  addDebtStoreId = storeId;
  document.getElementById('adWho').textContent = s.name;
  const cur = storeDebt(storeId);
  document.getElementById('adCurrent').textContent =
    cur > 0 ? ('Hozirgi qarz: ' + fmt(cur) + " so'm") : "Hozircha qarz yo'q";
  document.getElementById('adAmount').value = '';
  document.getElementById('adNote').value = '';
  document.getElementById('adErr').classList.add('hidden');
  openModal('modalAddDebt');
  setTimeout(function(){ try{ document.getElementById('adAmount').focus(); }catch(e){} }, 300);
}

function onDebtAmountInput(el){
  const n = parseMoney(el.value);
  el.value = n ? fmt(n) : '';
}

async function saveAddDebt(){
  const amount = parseMoney(document.getElementById('adAmount').value);
  const note = document.getElementById('adNote').value.trim();
  const err = document.getElementById('adErr');
  if(!amount){
    err.textContent = 'Qarz summasini yozing.';
    err.classList.remove('hidden');
    return;
  }
  const s = (state.stores || []).find(x => x.id === addDebtStoreId);
  if(!s) return;

  state.ledger = state.ledger || [];
  state.ledger.push({
    id: uid('l'), partyType: 'store', partyId: s.id, partyName: s.name,
    total: amount, paid: 0, debt: amount,
    date: todayISO(), status: 'debt', source: 'qolda',
    note: note, items: note ? [{ name: note, qty: 1 }] : []
  });
  await saveState();

  closeModal('modalAddDebt');
  /* Profilni yangilaymiz — yangi qarz darhol ko'rinsin */
  try{ openStoreDetail(s.id); }catch(e){}
  try{ renderStores(); renderDash(); }catch(e){}
}
