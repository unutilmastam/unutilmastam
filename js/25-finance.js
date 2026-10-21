/* Unutilmas Ta'm — 25-finance.js
   ═══════════════════════════════════════════════════════════════
   1) Chekdagi qarz — qarz to'langanda chek ham yangilanadi
   2) Chek chiqarishda magazinni XARITADAN tanlash (imzo o'rniga)
   3) Admin cheklarni o'chira oladi (bittalab yoki eski to'langanlarni)
   4) MOLIYA hisoboti: tushum, tannarx, foyda, xarajat, zarar, magazinlar

   Tartib MUHIM: 14-boot.js dan OLDIN, 22/23 dan KEYIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

/* ───────── 1. Chek ↔ qarz sinxronlash ─────────
   Chekning qarzi alohida saqlanardi va qarz to'langanda o'zgarmasdi.
   Endi har saqlashda chek o'z qarz yozuvidan (chek raqami bo'yicha)
   yangilanadi — hamma joyda bir xil raqam. */
function syncReceiptsFromLedger(){
  const recs = state.receipts || [];
  if(!recs.length) return;
  const byNo = {};
  (state.ledger || []).forEach(function(l){
    if(l.receiptNo) byNo[l.partyId + '|' + l.receiptNo] = l;
  });
  recs.forEach(function(r){
    const l = byNo[r.storeId + '|' + r.no];
    if(!l) return;
    r.paid = Math.max(0, (r.total || 0) - (l.debt || 0));
    r.debt = Math.max(0, l.debt || 0);
  });
}

(function(){
  const orig = saveState;
  saveState = async function(){
    try{ syncReceiptsFromLedger(); }catch(e){ console.warn('Chek sinxron:', e); }
    return orig.apply(this, arguments);
  };
})();

/* ───────── 2. Xaritadan magazin tanlash ─────────
   Belgilar BIR MARTA yaratiladi. Tanlanganda faqat rangi o'zgaradi —
   ilgari har tanlashda hammasi o'chirilib qayta chizilardi va shu
   paytdagi bosish o'chirilayotgan belgiga tushib yo'qolardi. */
let prnMap = null, prnMarkers = {}, prnMarkerKey = '';

function prnStoreColor(id){
  if(typeof pickedStoreId !== 'undefined' && pickedStoreId === id) return '#366C37';
  return typeof storeStatusColor === 'function' ? storeStatusColor(id) : '#547EA0';
}

function initPrintMap(){
  const el = document.getElementById('prnMap');
  if(!el || typeof L === 'undefined') return;
  const stores = (state.stores || []).filter(s => s.lat != null && s.lng != null);
  try{
    if(!prnMap){
      const c = stores.length
        ? [stores.reduce((a, s) => a + Number(s.lat), 0) / stores.length,
           stores.reduce((a, s) => a + Number(s.lng), 0) / stores.length]
        : [41.3111, 69.2797];
      prnMap = L.map('prnMap').setView(c, 12);
      if(typeof mapTileLayer === 'function') mapTileLayer().addTo(prnMap);
    }else if(prnMap.invalidateSize){
      prnMap.invalidateSize();
    }

    /* Magazinlar ro'yxati o'zgargandagina qayta yaratamiz */
    const key = stores.map(s => s.id + ':' + s.lat + ':' + s.lng).join('|');
    if(key !== prnMarkerKey){
      Object.values(prnMarkers).forEach(m => { try{ prnMap.removeLayer(m); }catch(e){} });
      prnMarkers = {};
      stores.forEach(function(s){
        const mk = L.marker([s.lat, s.lng], {
          icon: pinDivIcon(prnStoreColor(s.id)),
          hitPad: 16                      // barmoq uchun katta bosish maydoni
        });
        if(mk.bindTooltip) mk.bindTooltip(s.name, {permanent:true, direction:'top', offset:[0,-32], className:'mapNameLabel'});
        mk.on('click', function(){ pickStoreFromMap(s.id); });
        mk.addTo(prnMap);
        prnMarkers[s.id] = mk;
      });
      prnMarkerKey = key;
    }else{
      recolorPrintMarkers();
    }
  }catch(e){ console.warn('Chek xaritasi:', e); }
}

function recolorPrintMarkers(){
  Object.keys(prnMarkers).forEach(function(id){
    const mk = prnMarkers[id];
    if(mk && mk.setIcon) mk.setIcon(pinDivIcon(prnStoreColor(id)));
  });
}

let __lastMapPick = 0;
function pickStoreFromMap(storeId){
  const now = Date.now();
  if(now - __lastMapPick < 350) return;          // ikki marta kelsa — bittasi
  __lastMapPick = now;
  if(typeof pickStore === 'function') pickStore(storeId);
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  recolorPrintMarkers();                          // faqat rang — qayta yaratish yo'q
}

(function(){
  if(typeof askShopAndPrint !== 'function') return;
  const orig = askShopAndPrint;
  askShopAndPrint = function(){
    const r = orig.apply(this, arguments);
    setTimeout(initPrintMap, 350);      // oyna ko'ringach o'lchov to'g'ri bo'ladi
    return r;
  };
})();

/* ───────── 3. Cheklar ro'yxati: jonli qarz + admin o'chirishi ───────── */
function isAdm(){ return !!(currentUser && currentUser.role === 'admin'); }

receiptsHtml = function(storeId){
  syncReceiptsFromLedger();
  const list = (state.receipts || []).filter(r => r.storeId === storeId)
                                     .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if(!list.length) return '';
  const adm = isAdm();
  const oldPaid = list.filter(r => !(r.debt > 0) && (Date.now() - (r.ts || 0)) > 30 * 86400000).length;

  return `<div class="rcTitle">Cheklar (${list.length})</div>` +
    (adm && oldPaid ? `<button class="ghostBtn rcClean" onclick="cleanOldReceipts('${storeId}')">
        30 kundan eski to'langan cheklarni o'chirish (${oldPaid})</button>` : '') +
    list.slice(0, 40).map(function(r){
      const items = (r.items || []).map(i => i.name + ' ×' + i.qty).join(', ');
      return `<div class="rcRow">
        <div class="rcTop"><span>#${r.no}</span><b>${fmt(r.total)} so'm</b>
          ${adm ? `<button class="rcDel" title="O'chirish" onclick="deleteReceipt('${r.id}')">×</button>` : ''}</div>
        <div class="rcMeta">${new Date(r.ts).toLocaleString('uz-UZ')}</div>
        ${items ? `<div class="rcItems">${items}</div>` : ''}
        <div class="rcPay"><span>To'landi: <b>${fmt(r.paid)}</b></span>
          ${r.debt > 0 ? `<span class="rcDebt">Qarz: <b>${fmt(r.debt)}</b></span>` : `<span class="rcOk">To'liq to'langan ✓</span>`}</div>
      </div>`;
    }).join('');
};

function deleteReceipt(id){
  if(!isAdm()) return;
  const r = (state.receipts || []).find(x => x.id === id);
  if(!r) return;
  openTallyConfirm({
    title: "Chek o'chirilsinmi?",
    text: '<b>#' + r.no + '</b> — ' + fmt(r.total) + " so'm" +
          (r.debt > 0 ? "<br><br>Bu chekda <b>" + fmt(r.debt) + " so'm qarz</b> bor. Qarz o'chmaydi — faqat chek yozuvi." : ''),
    okText: "HA, O'CHIRISH", danger: true,
    onOk: async function(){
      state.receipts = state.receipts.filter(x => x.id !== id);
      await saveState();
      if(typeof refreshStoreDetailIfOpen === 'function') refreshStoreDetailIfOpen();
    }
  });
}

function cleanOldReceipts(storeId){
  if(!isAdm()) return;
  const cut = Date.now() - 30 * 86400000;
  const del = (state.receipts || []).filter(r => r.storeId === storeId && !(r.debt > 0) && (r.ts || 0) < cut);
  if(!del.length) return;
  openTallyConfirm({
    title: "Eski cheklar o'chirilsinmi?",
    text: "30 kundan eski va <b>to'liq to'langan</b> " + del.length + " ta chek o'chiriladi.<br><br>" +
          "Qarzi bor cheklar qoladi. Savdo hisobi va bonus o'zgarmaydi.",
    okText: "HA, O'CHIRISH", danger: true,
    onOk: async function(){
      const ids = {}; del.forEach(r => ids[r.id] = 1);
      state.receipts = state.receipts.filter(r => !ids[r.id]);
      await saveState();
      if(typeof refreshStoreDetailIfOpen === 'function') refreshStoreDetailIfOpen();
    }
  });
}

/* ───────── 4. MOLIYA ───────── */
let finPeriod = 'today';

function finRange(p){
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = 86400000, start = d.getTime();
  if(p === 'today') return [start, start + day];
  if(p === 'yesterday') return [start - day, start];
  if(p === 'week') return [start - 6 * day, start + day];
  if(p === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), start + day];
  if(p === 'prevmonth') return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
                                new Date(d.getFullYear(), d.getMonth(), 1).getTime()];
  return [0, start + day];
}

function isoTs(iso){ const t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; }

/* Barcha hisob-kitob shu yerda — bitta manba */
function computeFinance(from, to){
  const prod = {}; (state.products || []).forEach(p => prod[p.id] = p);
  const unitCost = function(pid, recorded){
    if(recorded != null) return Number(recorded);
    const p = prod[pid]; return p && p.cost != null ? Number(p.cost) : null;
  };

  const lines = [];          // har bir sotuv qatori: {ts, pid, name, qty, revenue, cost, storeId, storeName}
  (state.sales || []).forEach(function(s){
    const ts = s.ts || 0; if(ts < from || ts >= to) return;
    const qty = s.qty || 1;
    const revenue = s.total != null ? s.total : (s.price || 0) * qty;
    const uc = unitCost(s.productId, s.cost);
    lines.push({ ts, pid: s.productId, name: s.productName || '—', qty, revenue,
                 cost: uc != null ? uc * qty : null, storeId: s.storeId || '', storeName: s.storeName || '' });
  });
  (state.orders || []).forEach(function(o){
    if(o.status !== 'yetkazildi') return;               // faqat yetkazilgan buyurtma
    const ts = o.deliveredAt || o.ts || isoTs(o.date); if(ts < from || ts >= to) return;
    (o.items || []).forEach(function(i){
      const uc = unitCost(i.productId, null);
      lines.push({ ts, pid: i.productId, name: i.name || '—', qty: i.qty || 1,
                   revenue: (i.price || 0) * (i.qty || 1), cost: uc != null ? uc * (i.qty || 1) : null,
                   storeId: o.storeId || '', storeName: o.storeName || (o.customerName ? o.customerName : '') });
    });
  });

  const revenue = lines.reduce((a, l) => a + l.revenue, 0);
  const withCost = lines.filter(l => l.cost != null);
  const costKnownRevenue = withCost.reduce((a, l) => a + l.revenue, 0);
  const cogs = withCost.reduce((a, l) => a + l.cost, 0);
  const noCostRevenue = revenue - costKnownRevenue;

  const expenses = (state.expenses || []).filter(e => { const t = isoTs(e.date); return t >= from && t < to; })
                                         .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  /* yaroqsiz mahsulot zarari — tannarx bo'yicha (bo'lmasa sotuv narxida) */
  const returnsLoss = (state.returns || []).filter(r => (r.ts || 0) >= from && (r.ts || 0) < to)
    .reduce((a, r) => a + (r.cost != null ? r.cost * (r.qty || 1)
                          : (prod[r.productId] && prod[r.productId].cost != null ? prod[r.productId].cost * (r.qty || 1) : (r.loss || 0))), 0);

  const gross = costKnownRevenue - cogs;              // faqat tannarxi ma'lum sotuvdan
  const net = gross - expenses - returnsLoss;

  /* shu davrda berilgan qarzlarning hozirgacha TO'LANMAGAN qismi */
  const newDebt = (state.ledger || []).filter(l => { const t = isoTs(l.date); return t >= from && t < to; })
                                      .reduce((a, l) => a + (l.debt > 0 ? l.debt : 0), 0);
  const debtNow = (state.ledger || []).reduce((a, l) => a + (l.debt > 0 ? l.debt : 0), 0);

  const byStore = {};
  lines.forEach(function(l){
    const k = l.storeId || '_';
    byStore[k] = byStore[k] || { name: l.storeId ? l.storeName : "Magazinsiz (bog'lanmagan)", revenue: 0, qty: 0 };
    byStore[k].revenue += l.revenue; byStore[k].qty += l.qty;
  });
  const byProd = {};
  lines.forEach(function(l){
    const k = l.pid || l.name;
    byProd[k] = byProd[k] || { name: l.name, qty: 0, revenue: 0, cost: 0, costKnown: true };
    byProd[k].qty += l.qty; byProd[k].revenue += l.revenue;
    if(l.cost == null) byProd[k].costKnown = false; else byProd[k].cost += l.cost;
  });
  const byDay = {};
  lines.forEach(function(l){
    const d = new Date(l.ts); const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    byDay[k] = byDay[k] || { revenue: 0, profit: 0 };
    byDay[k].revenue += l.revenue;
    if(l.cost != null) byDay[k].profit += l.revenue - l.cost;
  });

  return { revenue, cogs, gross, expenses, returnsLoss, net, noCostRevenue, newDebt, debtNow,
           count: lines.length,
           stores: Object.values(byStore).sort((a, b) => b.revenue - a.revenue),
           products: Object.values(byProd).sort((a, b) => b.revenue - a.revenue),
           days: Object.keys(byDay).sort().reverse().map(k => Object.assign({ day: k }, byDay[k])) };
}

function openFinance(){
  if(!isAdm()) return;
  renderFinance();
  openModal('modalFinance');
}

function setFinPeriod(p){ finPeriod = p; renderFinance(); }

function renderFinance(){
  const [from, to] = finRange(finPeriod);
  const f = computeFinance(from, to);
  document.querySelectorAll('#finTabs button').forEach(b => b.classList.toggle('on', b.getAttribute('data-p') === finPeriod));
  const sign = v => (v < 0 ? '−' : '') + fmt(Math.abs(v));
  const noCost = (state.products || []).filter(p => p.cost == null).length;

  document.getElementById('finBody').innerHTML = `
    ${noCost ? `<div class="prnDebtNote" style="margin-bottom:12px;">
       <b>${noCost} ta mahsulotda tannarx kiritilmagan</b> — ularning foydasi hisoblanmaydi.
       Mahsulotlar -> tahrirlash -> "Tannarx".</div>` : ''}
    <div class="finGrid">
      <div class="finCard big"><label>Tushum</label><b>${fmt(f.revenue)}</b><span>${f.count} ta sotuv</span></div>
      <div class="finCard big ${f.net >= 0 ? 'pos' : 'neg'}"><label>Sof foyda</label><b>${sign(f.net)}</b><span>xarajat va zarardan keyin</span></div>
      <div class="finCard"><label>Tannarx</label><b>${fmt(f.cogs)}</b></div>
      <div class="finCard ${f.gross >= 0 ? 'pos' : 'neg'}"><label>Yalpi foyda</label><b>${sign(f.gross)}</b></div>
      <div class="finCard neg"><label>Xarajatlar</label><b>${fmt(f.expenses)}</b></div>
      <div class="finCard neg"><label>Yaroqsiz (zarar)</label><b>${fmt(f.returnsLoss)}</b></div>
      <div class="finCard"><label>Shu davr qarzi</label><b>${fmt(f.newDebt)}</b></div>
      <div class="finCard neg"><label>Umumiy qarz (hozir)</label><b>${fmt(f.debtNow)}</b></div>
    </div>
    ${f.noCostRevenue > 0 ? `<p class="smallMuted finNote">Tannarxi noma'lum sotuv: ${fmt(f.noCostRevenue)} so'm — foydaga kiritilmadi.</p>` : ''}

    <div class="finSec">Magazinlar bo'yicha</div>
    ${f.stores.length ? `<div class="finTable">${f.stores.map(s => `
      <div class="finRow"><span>${s.name || '—'}</span><em>${s.qty} dona</em><b>${fmt(s.revenue)}</b></div>`).join('')}</div>`
      : `<p class="smallMuted">Bu davrda savdo yo'q</p>`}

    <div class="finSec">Kunlar bo'yicha</div>
    ${f.days.length ? `<div class="finTable">
      <div class="finRow head"><span>Sana</span><em>Tushum</em><b>Foyda</b></div>
      ${f.days.slice(0, 31).map(d => `<div class="finRow"><span>${d.day.split('-').reverse().join('.')}</span>
        <em>${fmt(d.revenue)}</em><b class="${d.profit < 0 ? 'neg' : 'pos'}">${sign(d.profit)}</b></div>`).join('')}</div>`
      : `<p class="smallMuted">—</p>`}

    <div class="finSec">Mahsulotlar bo'yicha</div>
    ${f.products.length ? `<div class="finTable">
      <div class="finRow head"><span>Mahsulot</span><em>Dona</em><b>Foyda</b></div>
      ${f.products.map(p => `<div class="finRow"><span>${p.name}</span><em>${p.qty}</em>
        <b class="${p.costKnown ? (p.revenue - p.cost < 0 ? 'neg' : 'pos') : 'muted'}">${p.costKnown ? sign(p.revenue - p.cost) : "tannarx yo'q"}</b></div>`).join('')}</div>`
      : `<p class="smallMuted">—</p>`}`;
}
