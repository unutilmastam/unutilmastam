/* Unutilmas Ta'm — 15-tally.js
   TEZ HISOB (faqat admin)

   Uch amal:
     SOTISH     — tanlangan mahsulotlar sotiladi, ombordan ayiriladi
     QAYTARISH  — yaroqsiz qaytarildi, ombordan ayiriladi, zarar yoziladi
     QO'SHISH   — omborga yangi mahsulot kiritiladi

   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

let tally = {};
let tallyOn = (function(){
  try { return localStorage.getItem('utam_tally') === '1'; } catch(e){ return false; }
})();
let tallyTab = 'sell';       // sell | back | add
let restockQty = {};
let tallyReceiptPending = false;
let tallySold = false;          // shu partiya sotilgan/qaytarilganmi
let tallySoldKind = '';         // 'sell' | 'back'

/* ───────── Rejim ───────── */
function toggleTallyMode(){
  if(!currentUser || currentUser.role !== 'admin') return;
  tallyOn = !tallyOn;
  try { localStorage.setItem('utam_tally', tallyOn ? '1' : '0'); } catch(e){}
  if(!tallyOn) tally = {};
  document.body.classList.toggle('tallyOn', tallyOn);
  syncTallyMenuUI();
  refreshTallyBar();
  try { renderCatalog(); } catch(e){}
  try { renderProducts(); } catch(e){}
  try { if(navigator.vibrate) navigator.vibrate(10); } catch(e){}
}

function syncTallyMenuUI(){
  const sw = document.getElementById('tallySwitch');
  if(sw) sw.classList.toggle('on', tallyOn);
  const lbl = document.getElementById('tallyMenuState');
  if(lbl) lbl.textContent = tallyOn ? 'Yoqilgan' : "O'chirilgan";
}

function initTallyMode(){
  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  if(!isAdmin){ tallyOn = false; tally = {}; }
  document.body.classList.toggle('tallyOn', tallyOn && isAdmin);
  const wrap = document.getElementById('tallyMenuWrap');
  if(wrap) wrap.classList.toggle('hidden', !isAdmin);
  syncTallyMenuUI();
  refreshTallyBar();
}

/* ───────── Katalogdagi "+" ───────── */
function cardPlus(productId, evt){
  if(tallyOn && currentUser && currentUser.role === 'admin') tallyAdd(productId, evt);
  else quickAddToCart(productId, evt);
}


/* ───────── Kartochkadagi tugmalar ─────────
   Tez hisob YOQIQ (admin)  →  −  [son]  +      (sotib olish tugmasi yo'q)
   Tez hisob O'CHIQ         →  Sotib olish  +   (odatdagidek) */
function tallyCardControls(p){
  const on = tallyOn && currentUser && currentUser.role === 'admin';
  if(on){
    const n = tally[p.id] || 0;
    return `<div class="cardActions2 tallyCtrl">
      <button class="tcMinus" onclick="event.stopPropagation();tallySub('${p.id}', event)">&minus;</button>
      <input class="tcNum" type="number" min="0" id="tallyInp-${p.id}" value="${n}"
             onclick="event.stopPropagation()"
             onchange="event.stopPropagation();tallySetQty('${p.id}', this.value)"
             onfocus="this.select()">
      <button class="tcPlus" onclick="event.stopPropagation();tallyAdd('${p.id}', event)">+</button>
    </div>`;
  }
  /* Buyurtma asosida tayyorlanadigan mahsulot:
     "+" tugmasi YO'Q, o'rniga yashil "Buyurtma" tugmasi */
  if(p.preorder){
    return `<div class="cardActions2">
      <button class="orderBtn2" onclick="event.stopPropagation();openProductDetail('${p.id}')">Buyurtma</button>
    </div>`;
  }
  return `<div class="cardActions2">
      <button class="buyBtn2" onclick="event.stopPropagation();openProductDetail('${p.id}')" ${p.stock<=0?'disabled':''}>⚡ Sotib olish</button>
      <button class="quickAddBtn2" onclick="event.stopPropagation();cardPlus('${p.id}', event)">${ic('plus',16)}</button>
    </div>`;
}

/* ───────── Sanash ───────── */
function tallyAdd(productId, evt){
  if(evt){ evt.stopPropagation(); evt.preventDefault(); }
  if(!tallyOn) return;
  if(tallySold){
    alert("Bu mahsulotlar allaqachon rasmiylashtirilgan.\n\nYangi mahsulot qo'shish uchun avval ro'yxatni tozalang.");
    return;
  }
  tally[productId] = (tally[productId] || 0) + 1;
  updateTallyCard(productId);
  refreshTallyBar();
  try { if(navigator.vibrate) navigator.vibrate(6); } catch(e){}
}

function tallySub(productId, evt){
  if(evt){ evt.stopPropagation(); evt.preventDefault(); }
  if(!tally[productId]) return;
  tally[productId]--;
  if(tally[productId] <= 0) delete tally[productId];
  updateTallyCard(productId);
  refreshTallyBar();
}

function tallySetQty(productId, qty){
  const q = Math.max(0, parseInt(qty, 10) || 0);
  if(q === 0) delete tally[productId]; else tally[productId] = q;
  updateTallyCard(productId);
  refreshTallyBar();
  const m = document.getElementById('modalTally');
  if(m && !m.classList.contains('hidden')) renderTallySheet();
}

function updateTallyCard(productId){
  const n = tally[productId] || 0;
  const badge = document.getElementById('tallyQty-' + productId);
  if(badge){
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
    if(n > 0){ badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    if(badge.parentElement) badge.parentElement.classList.toggle('picked', n > 0);
  }
  const inp = document.getElementById('tallyInp-' + productId);
  if(inp && document.activeElement !== inp) inp.value = n;
}

/* ───────── Hisob ───────── */
function tallyItems(){
  return Object.keys(tally).map(pid => {
    const p = (state.products || []).find(x => x.id === pid);
    if(!p || !tally[pid]) return null;
    const price = priceOf(p, 'store');
    const qty = tally[pid];
    return { id:pid, name:p.name, qty, price, sum:price*qty,
             gram:Number(p.gram)||0, unitType:p.unitType||'gram',
             amount:formatProductAmount(p), stock:Number(p.stock)||0,
             totalGram:(Number(p.gram)||0)*qty };
  }).filter(Boolean).sort((a,b) => b.sum - a.sum);
}

function tallyTotals(){
  const items = tallyItems();
  return { items, kinds:items.length,
           qty: items.reduce((s,i)=>s+i.qty,0),
           sum: items.reduce((s,i)=>s+i.sum,0),
           gram:items.reduce((s,i)=>s+(i.unitType==='gram'?i.totalGram:0),0) };
}

/* ───────── Yashil panel — rejim yoqiq bo'lsa DOIM ko'rinadi ───────── */
function refreshTallyBar(){
  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  const t = tallyTotals();
  const bars = document.querySelectorAll('.tallyBar');
  for(let k = 0; k < bars.length; k++){
    const bar = bars[k];
    if(!tallyOn || !isAdmin){ bar.classList.add('hidden'); continue; }
    bar.classList.remove('hidden');
    const s = bar.querySelector('.tbSum');
    const m = bar.querySelector('.tbMeta');
    if(s) s.textContent = fmt(t.sum) + " so'm";
    if(m) m.textContent = t.kinds ? (t.kinds + ' xil · ' + t.qty + ' dona') : 'Mahsulot tanlang';
    bar.classList.toggle('empty', t.kinds === 0);
  }
}

/* ───────── Katta oyna ───────── */
function openTallySheet(){
  if(!tallyOn) return;
  tallyTab = 'sell';
  renderTallySheet();
  openModal('modalTally');
}

function setTallyTab(tab){
  tallyTab = tab;
  if(tab === 'add') restockQty = {};
  renderTallySheet();
}

function renderTallySheet(){
  const tabs = ['sell','back','add'];
  for(let k = 0; k < tabs.length; k++){
    const b = document.getElementById('tallyTab-' + tabs[k]);
    if(b) b.classList.toggle('active', tallyTab === tabs[k]);
  }
  const box = document.getElementById('tallyBody');
  if(!box) return;
  box.innerHTML = (tallyTab === 'add') ? renderRestockView() : renderSellView(tallyTab);
}

function renderSellView(mode){
  const t = tallyTotals();
  if(!t.kinds){
    return `<div class="tallyEmpty">${emptyHtml('box', 'Mahsulot tanlanmagan')}
      <p class="smallMuted" style="text-align:center;margin-top:-10px;">
        Katalogdan <b>+</b> tugmasi bilan mahsulot qo'shing.</p></div>`;
  }
  const isBack = (mode === 'back');
  let rows = '';
  for(let k = 0; k < t.items.length; k++){
    const i = t.items[k];
    const over = i.qty > i.stock;
    rows += `
    <div class="tallyRow${over ? ' overStock' : ''}">
      <div class="tRowMain">
        <div class="tName">${i.name}${i.amount ? ` <span class="tAmount">${i.amount}</span>` : ''}</div>
        <div class="tCalc">${fmt(i.price)} so'm &times; ${i.qty}${
          i.unitType === 'gram' && i.gram ? ` &nbsp;·&nbsp; ${fmt(i.totalGram)} g` : ''}
          <span class="tStock${over ? ' bad' : ''}">ombor: ${i.stock}</span></div>
      </div>
      <div class="tQtyBox">
        <button class="qMinus" onclick="tallySub('${i.id}')">&minus;</button>
        <input type="number" min="0" value="${i.qty}" onchange="tallySetQty('${i.id}', this.value)" onfocus="this.select()">
        <button class="qPlus" onclick="tallyAdd('${i.id}')">+</button>
      </div>
      <div class="tSum">${fmt(i.sum)}</div>
    </div>`;
  }
  let over = false;
  for(let k = 0; k < t.items.length; k++) if(t.items[k].qty > t.items[k].stock) over = true;
  const warn = over ? `<div class="tallyWarn">Ba'zi mahsulotlar ombordagidan ko'p tanlangan — ombor manfiyga tushadi.</div>` : '';
  const soldBanner = tallySold ? `
    <div class="soldBanner">
      <div class="sbTitle">${tallySoldKind === 'back' ? 'Bu mahsulotlar qaytarildi' : 'Bu mahsulotlar sotildi'}</div>
      <div class="sbText">Yangi mahsulot qo'shish uchun avval ro'yxatni tozalang.</div>
    </div>` : '';

  return `
    <div class="tallySummary">
      <div><span>${t.kinds} xil</span><label>Turlari</label></div>
      <div><span>${t.qty} dona</span><label>Miqdor</label></div>
      <div><span>${t.gram ? fmt(t.gram) + ' g' : '—'}</span><label>Og'irlik</label></div>
    </div>
    ${soldBanner}
    ${warn}
    <div class="tallyList">${rows}</div>
    <div class="pdTotalRow" style="margin-top:12px;">
      <span>${isBack ? 'Zarar summasi' : 'Jami'}</span>
      <b class="${isBack ? 'lossSum' : ''}">${fmt(t.sum)} so'm</b>
    </div>
    ${tallySold
      ? `<button class="ghostBtn" style="width:100%;margin-top:12px;" onclick="tallyReceipt()"><span id="ic-tally-receipt"></span> Chekni qayta chiqarish</button>`
      : (isBack
        ? `<button class="primaryBtn dangerBtn" style="width:100%;margin-top:12px;" onclick="tallyDoReturn()">Qaytarilgan deb belgilash</button>`
        : `<button class="primaryBtn" style="width:100%;margin-top:12px;" onclick="tallyDoSell()">Sotish</button>`)}
    <button class="ghostBtn" style="width:100%;margin-top:9px;color:#EF4B62;" onclick="clearTally()">Tozalash</button>`;
}

function renderRestockView(){
  const list = (state.products || []).slice().sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
  if(!list.length) return emptyHtml('box', "Mahsulot yo'q");
  let rows = '';
  for(let k = 0; k < list.length; k++){
    const p = list[k];
    const add = restockQty[p.id] || 0;
    rows += `
    <div class="restockRow${add > 0 ? ' picked' : ''}" id="rsRow-${p.id}">
      <div class="rsThumb">${prodThumb(p, 22)}</div>
      <div class="rsMain">
        <div class="rsName">${p.name}</div>
        <div class="rsMeta">${formatProductAmount(p) || '—'} · ${fmt(priceOf(p,'store'))} so'm
          <span class="rsStock">omborda ${Number(p.stock) || 0} dona</span></div>
      </div>
      <div class="tQtyBox">
        <button class="qMinus" onclick="restockStep('${p.id}', -1)">&minus;</button>
        <input type="number" min="0" id="rsInp-${p.id}" value="${add}" onchange="restockSet('${p.id}', this.value)" onfocus="this.select()">
        <button class="qPlus" onclick="restockStep('${p.id}', 1)">+</button>
      </div>
    </div>`;
  }
  let total = 0;
  for(const k in restockQty) total += restockQty[k] || 0;
  return `
    <p class="smallMuted" style="margin:0 0 10px;">Omborga qo'shiladigan miqdorni belgilang.</p>
    <div class="tallyList restockList">${rows}</div>
    <div class="pdTotalRow" style="margin-top:12px;"><span>Qo'shiladi</span><b id="restockTotal">${total} dona</b></div>
    <button class="primaryBtn" style="width:100%;margin-top:12px;" onclick="saveRestock()">Saqlash</button>`;
}

function restockStep(pid, d){ restockSet(pid, (restockQty[pid] || 0) + d); }

function restockSet(pid, val){
  const q = Math.max(0, parseInt(val, 10) || 0);
  if(q === 0) delete restockQty[pid]; else restockQty[pid] = q;
  const inp = document.getElementById('rsInp-' + pid);
  if(inp && document.activeElement !== inp) inp.value = q;
  const row = document.getElementById('rsRow-' + pid);
  if(row) row.classList.toggle('picked', q > 0);
  let total = 0;
  for(const k in restockQty) total += restockQty[k] || 0;
  const tot = document.getElementById('restockTotal');
  if(tot) tot.textContent = total + ' dona';
}

async function saveRestock(){
  const ids = Object.keys(restockQty).filter(function(k){ return restockQty[k] > 0; });
  if(!ids.length){ alert("Hech narsa qo'shilmadi."); return; }
  let total = 0;
  for(let k = 0; k < ids.length; k++) total += restockQty[ids[k]];
  if(!confirm(ids.length + " xil mahsulot, jami " + total + " dona omborga qo'shilsinmi?")) return;
  for(let k = 0; k < ids.length; k++){
    const p = state.products.find(function(x){ return x.id === ids[k]; });
    if(p) p.stock = (Number(p.stock) || 0) + restockQty[ids[k]];
  }
  restockQty = {};
  await saveState();
  try{ renderProducts(); renderCatalog(); renderDash(); }catch(e){}
  renderTallySheet();
  alert('Ombor yangilandi.');
}

/* ───────── SOTISH ───────── */
function tallyDoSell(){
  const t = tallyTotals();
  if(!t.kinds){ alert('Mahsulot tanlanmagan.'); return; }
  if(tallySold){ alert("Bu mahsulotlar allaqachon rasmiylashtirilgan. Avval ro'yxatni tozalang."); return; }
  openTallyConfirm({
    title: 'Sotishni tasdiqlaysizmi?',
    text: 'Siz <b>' + t.kinds + ' xil</b>, jami <b>' + t.qty + ' dona</b> mahsulotni sotmoqdasiz.',
    sum: fmt(t.sum) + " so'm",
    onOk: doSellConfirmed
  });
}

async function doSellConfirmed(){
  const t = tallyTotals();
  const ts = nowTs();
  for(let k = 0; k < t.items.length; k++){
    const i = t.items[k];
    const p = state.products.find(function(x){ return x.id === i.id; });
    if(p) p.stock = (Number(p.stock) || 0) - i.qty;
    state.sales.push({ id:uid('sl'), productId:i.id, productName:i.name,
      gram:i.gram, price:i.price, qty:i.qty, total:i.sum, source:'tez-hisob', ts,
      cost: (p && p.cost != null) ? Number(p.cost) : null });
  }
  /* MUHIM: magazin hali TANLANMAGAN (u chek chiqarishda tanlanadi).
     Shuning uchun bu yerda bog'lamaymiz — faqat chek raqami bilan
     belgilab qo'yamiz. Bog'lash chek chiqarilganda bo'ladi.
     (Ilgari bu yerda OLDINGI chekdagi magazinga yozib yuborilardi.) */
  try{
    const rno = 'TH-' + String(ts).slice(-6);
    for(let k = state.sales.length - t.items.length; k < state.sales.length; k++){
      if(state.sales[k]) state.sales[k].receiptNo = rno;
    }
    window.__pendingSale = { receiptNo: rno, ts: ts, total: t.sum, linked: false,
      items: t.items.map(function(i){ return {name:i.name, qty:i.qty, sum:i.sum, price:i.price}; }) };
  }catch(e){ console.warn('Chek belgisi:', e); }

  await saveState();
  tallySold = true; tallySoldKind = 'sell';
  try{ renderProducts(); renderCatalog(); renderDash(); }catch(e){}
  refreshTallyBar();
  renderTallySheet();
  tallyReceipt();          // sotilgach chek darhol ochiladi
}

/* ───────── QAYTARISH ───────── */
function tallyDoReturn(){
  const t = tallyTotals();
  if(!t.kinds){ alert('Mahsulot tanlanmagan.'); return; }
  if(tallySold){ alert("Bu mahsulotlar allaqachon rasmiylashtirilgan. Avval ro'yxatni tozalang."); return; }
  openTallyConfirm({
    title: 'Qaytarishni tasdiqlaysizmi?',
    text: 'Siz <b>' + t.kinds + ' xil</b>, jami <b>' + t.qty + ' dona</b> mahsulotni yaroqsiz deb belgilamoqdasiz.',
    sum: fmt(t.sum) + " so'm zarar",
    danger: true,
    onOk: doReturnConfirmed
  });
}

async function doReturnConfirmed(){
  const t = tallyTotals();
  const ts = nowTs();
  if(!Array.isArray(state.returns)) state.returns = [];
  for(let k = 0; k < t.items.length; k++){
    const i = t.items[k];
    const p = state.products.find(function(x){ return x.id === i.id; });
    if(p) p.stock = (Number(p.stock) || 0) - i.qty;
    state.returns.push({ id:uid('rt'), productId:i.id, productName:i.name,
      gram:i.gram, price:i.price, qty:i.qty, loss:i.sum, reason:'yaroqsiz', ts,
      cost: (function(){ const pp = state.products.find(x=>x.id===i.id); return pp && pp.cost != null ? Number(pp.cost) : null; })() });
  }
  await saveState();
  tallySold = true; tallySoldKind = 'back';
  try{ renderProducts(); renderCatalog(); renderDash(); }catch(e){}
  refreshTallyBar();
  renderTallySheet();
  showSoldToast();
}

function clearTally(){
  if(!Object.keys(tally).length) return;
  openTallyConfirm({
    title: 'Tozalansinmi?',
    text: 'Tanlangan barcha mahsulotlar ro\'yxatdan olib tashlanadi.',
    okText: 'HA, TOZALA',
    danger: true,
    onOk: function(){
      tally = {}; tallySold = false; tallySoldKind = '';
      refreshTallyBar(); renderTallySheet();
      try{ renderCatalog(); renderProducts(); }catch(e){}
    }
  });
}

/* ───────── Chek ───────── */
function tallyReceipt(){
  const t = tallyTotals();
  if(!t.kinds){ alert('Mahsulot tanlanmagan.'); return; }
  const now = new Date();
  calcReceiptNo = 'TH-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' +
                  Math.random().toString(36).slice(2,6).toUpperCase();

  document.getElementById('crChekNo').textContent = '#' + calcReceiptNo;
  document.getElementById('crDate').textContent = now.toLocaleString('uz-UZ',
    {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('crKinds').textContent = t.kinds + ' ta';
  const ct = document.getElementById('crPriceType');
  if(ct) ct.textContent = 'Оптовая';
  const crLogo = document.getElementById('crLogoImg');
  if(crLogo){ crLogo.src = getAppLogo(); crLogo.alt = "Unutilmas Ta'm"; }

  let rows = '';
  for(let k = 0; k < t.items.length; k++){
    const i = t.items[k];
    rows += `<div class="rItemRow">
      <div><div class="riName">${i.name}${i.amount ? ` <span class="riAmount">${i.amount}</span>` : ''}</div>
      <div class="riQty">${fmt(i.price)} so'm &times; ${i.qty}</div></div>
      <div class="riPrice">${fmt(i.sum)} so'm</div></div>`;
  }
  document.getElementById('crItemsList').innerHTML = rows;
  document.getElementById('crSumsList').innerHTML =
    `<div class="rSumRow"><span>Видов товара</span><span>${t.kinds}</span></div>` +
    `<div class="rSumRow"><span>Всего штук</span><span>${t.qty}</span></div>` +
    (t.gram ? `<div class="rSumRow"><span>Общий вес</span><span>${fmt(t.gram)} г</span></div>` : '');
  document.getElementById('crTotalAmt').textContent = fmt(t.sum) + " so'm";

  tallyReceiptPending = true;
  openModal('modalCalcReceipt');   // tez hisob oynasi ochiq qoladi
}

/* Chek oynasi yopilganda hisob tozalanadi */
function onCalcReceiptClosed(){
  if(!tallyReceiptPending) return;
  tallyReceiptPending = false;
  /* Tez hisob oynasi ochiq qoladi, ro'yxat saqlanadi */
  renderTallySheet();
  if(tallySold) setTimeout(showSoldToast, 220);
}

/* ═══ "Mahsulotlar sotildi" xabari ═══
   3 soniya turadi, OK bosilsa darhol yopiladi. */
let _soldTimer = null;

function showSoldToast(){
  const isBack = (tallySoldKind === 'back');
  let el = document.getElementById('soldToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'soldToast';
    el.className = 'hidden';
    el.onclick = function(e){ if(e.target === el) hideSoldToast(); };
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="stCard">
      <div class="stIcon">
        <svg viewBox="0 0 24 24"><path d="M4 12.5 L9.5 18 L20 6.5"/></svg>
      </div>
      <div class="stTitle">${isBack ? 'Qaytarildi' : 'Mahsulotlar sotildi'}</div>
      <div class="stText">${isBack ? 'Yaroqsiz deb belgilandi va ombordan ayrildi.'
                                   : 'Sotuv qayd etildi va ombordan ayrildi.'}</div>
      <button class="stOk" onclick="hideSoldToast()">OK</button>
    </div>`;
  el.classList.remove('hidden');
  try{ if(navigator.vibrate) navigator.vibrate([12, 40, 12]); }catch(e){}
  /* Avtomatik yopilish OLIB TASHLANDI — OK bosilguncha turadi */
}

function hideSoldToast(){
  clearTimeout(_soldTimer);
  _soldTimer = null;
  const el = document.getElementById('soldToast');
  if(el) el.classList.add('hidden');
  /* tez hisob oynasiga qaytamiz */
  renderTallySheet();
}

/* ═══ CHIROYLI TASDIQLASH OYNASI (ko'k / qizil) ═══ */
let _tcOk = null, _tcNo = null;
function openTallyConfirm(o){
  _tcOk = o.onOk || null;
  _tcNo = o.onNo || null;
  document.getElementById('tcTitle').textContent = o.title || 'Tasdiqlaysizmi?';
  document.getElementById('tcText').innerHTML = o.text || '';
  const sumEl = document.getElementById('tcSum');
  if(o.sum){ sumEl.textContent = o.sum; sumEl.classList.remove('hidden'); }
  else sumEl.classList.add('hidden');
  const ok = document.getElementById('tcOkBtn');
  ok.textContent = o.okText || 'TASDIQLASH';
  ok.classList.toggle('tcDanger', !!o.danger);
  document.getElementById('tcNoBtn').textContent = o.noText || 'BEKOR QILISH';
  openModal('modalTallyConfirm');
}

function tallyConfirmYes(){
  const fn = _tcOk; _tcOk = null; _tcNo = null;
  closeModal('modalTallyConfirm');
  if(fn) setTimeout(fn, 180);
}

function tallyConfirmNo(){
  const fn = _tcNo; _tcOk = null; _tcNo = null;
  closeModal('modalTallyConfirm');
  if(fn) setTimeout(fn, 180);
}

/* ───────── Qaytarilganlar ───────── */
function returnsSummary(){
  const list = Array.isArray(state.returns) ? state.returns : [];
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const t0 = d0.getTime();
  const today = list.filter(function(r){ return (r.ts || 0) >= t0; });
  let tq=0, tl=0, aq=0, al=0;
  for(let k=0;k<today.length;k++){ tq += today[k].qty||0; tl += today[k].loss||0; }
  for(let k=0;k<list.length;k++){ aq += list[k].qty||0; al += list[k].loss||0; }
  return { all:list, today, todayQty:tq, todayLoss:tl, totalQty:aq, totalLoss:al };
}

function openReturnsView(){
  const r = returnsSummary();
  const box = document.getElementById('returnsList');
  if(!box) return;
  if(!r.all.length){
    box.innerHTML = emptyHtml('box', "Qaytarilgan mahsulot yo'q");
  }else{
    const sorted = r.all.slice().sort(function(a,b){ return (b.ts||0)-(a.ts||0); }).slice(0,200);
    let rows = '';
    for(let k = 0; k < sorted.length; k++){
      const x = sorted[k];
      rows += `<div class="tallyRow">
        <div class="tRowMain">
          <div class="tName">${x.productName}</div>
          <div class="tCalc">${x.qty} dona · ${new Date(x.ts).toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div class="tSum lossSum">−${fmt(x.loss || 0)}</div>
      </div>`;
    }
    box.innerHTML = rows;
  }
  document.getElementById('returnsTodayQty').textContent  = r.todayQty + ' dona';
  document.getElementById('returnsTodayLoss').textContent = fmt(r.todayLoss) + " so'm";
  document.getElementById('returnsAllLoss').textContent   = fmt(r.totalLoss) + " so'm";
  openModal('modalReturns');
}


/* ═══════════════════════════════════════════════════════════════
   MAHSULOT RASMLARI — galereya (4-5 tagacha)
   p.image      — asosiy rasm (eski maydon, saqlanadi)
   p.images[]   — qo'shimcha rasmlar
   ═══════════════════════════════════════════════════════════════ */
let galImages = [];
let galIndex  = 0;

function productImages(p){
  const arr = [];
  if(p && p.image) arr.push(p.image);
  if(p && Array.isArray(p.images)){
    for(let k = 0; k < p.images.length; k++){
      if(p.images[k] && arr.indexOf(p.images[k]) === -1) arr.push(p.images[k]);
    }
  }
  return arr;
}

function renderProductGallery(p){
  const box = document.getElementById('pdImg');
  if(!box) return;
  galImages = productImages(p);
  galIndex = 0;

  if(!galImages.length){
    box.innerHTML = prodThumb(p, 44);
    setGalExtras('');
    return;
  }
  box.innerHTML = `<img src="${galImages[0]}" alt="${p.name}" onclick="openImgViewer(0)">`;
  attachSwipe(box, function(dir){ showGalImage(galIndex + dir); });

  if(galImages.length > 1){
    let dots = '', strip = '';
    for(let k = 0; k < galImages.length; k++){
      dots  += `<i class="${k===0?'on':''}"></i>`;
      strip += `<img src="${galImages[k]}" class="${k===0?'on':''}" onclick="showGalImage(${k})" alt="">`;
    }
    setGalExtras(`<div class="pdGalDots" id="pdGalDots">${dots}</div>
                  <div class="pdGalStrip" id="pdGalStrip">${strip}</div>`);
  }else{
    setGalExtras('');
  }
}

function setGalExtras(html){
  let holder = document.getElementById('pdGalExtras');
  if(!holder){
    const box = document.getElementById('pdImg');
    if(!box || !box.parentElement) return;
    holder = document.createElement('div');
    holder.id = 'pdGalExtras';
    box.parentElement.insertBefore(holder, box.nextSibling);
  }
  holder.innerHTML = html;
}

function showGalImage(i){
  if(!galImages.length) return;
  /* aylanma: oxiridan boshiga o'tadi */
  i = (i + galImages.length) % galImages.length;
  galIndex = i;
  const box = document.getElementById('pdImg');
  if(box){
    box.innerHTML = `<img src="${galImages[i]}" onclick="openImgViewer(${i})" alt="">`;
    attachSwipe(box, function(dir){ showGalImage(galIndex + dir); });
  }
  const dots = document.getElementById('pdGalDots');
  if(dots) for(let k = 0; k < dots.children.length; k++)
    dots.children[k].className = (k === i ? 'on' : '');
  const strip = document.getElementById('pdGalStrip');
  if(strip) for(let k = 0; k < strip.children.length; k++)
    strip.children[k].className = (k === i ? 'on' : '');
}

/* Barmoq bilan chapga/o'ngga surishni ushlaydi */
function attachSwipe(el, onSwipe){
  if(!el || el.__swipeOn) return;
  el.__swipeOn = true;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', function(e){
    const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
  }, {passive:true});
  el.addEventListener('touchend', function(e){
    if(x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    /* gorizontal siljish vertikaldan katta bo'lsa — bu surish */
    if(Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5){
      onSwipe(dx < 0 ? 1 : -1);
    }
  }, {passive:true});
}

/* ── To'liq ekranda ko'rish ── */
function openImgViewer(i){
  if(!galImages.length) return;
  galIndex = (typeof i === 'number') ? i : 0;
  let v = document.getElementById('imgViewer');
  if(!v){
    v = document.createElement('div');
    v.id = 'imgViewer';
    v.className = 'hidden';
    v.onclick = function(e){ if(e.target === v) closeImgViewer(); };
    v.innerHTML = `<button class="ivClose" onclick="closeImgViewer()">&times;</button>
      <img id="ivImg" alt="">
      <div class="ivNav" id="ivNav"></div>`;
    document.body.appendChild(v);
  }
  document.getElementById('ivImg').src = galImages[galIndex];
  attachSwipe(v, function(dir){ ivStep(dir); });
  const nav = document.getElementById('ivNav');
  if(galImages.length > 1){
    nav.innerHTML = `<button onclick="ivStep(-1)">&lsaquo;</button><button onclick="ivStep(1)">&rsaquo;</button>`;
  }else nav.innerHTML = '';
  v.classList.remove('hidden');
}

function ivStep(d){
  galIndex = (galIndex + d + galImages.length) % galImages.length;
  const im = document.getElementById('ivImg');
  if(im) im.src = galImages[galIndex];
}

function closeImgViewer(){
  const v = document.getElementById('imgViewer');
  if(v) v.classList.add('hidden');
}


/* ═══ QO'SHIMCHA RASMLAR (mahsulot formasi) ═══
   Asosiy rasm bilan bir xil siqiladi: 640px, JPEG.
   Bulut hujjati 1 MB bilan cheklangani uchun bu MUHIM. */
let pendingExtraImages = [];

function addExtraImages(e){
  const files = Array.prototype.slice.call(e.target.files || []);
  if(!files.length) return;
  const room = 4 - pendingExtraImages.length;
  if(room <= 0){ alert("Ko'pi bilan 4 ta qo'shimcha rasm qo'yish mumkin."); return; }

  files.slice(0, room).forEach(function(file){
    const reader = new FileReader();
    reader.onload = function(){
      const img = new Image();
      img.onload = async function(){
        // Rasm serverga (uploads/) saqlanadi, shuning uchun sifatni
        // pasaytirish shart emas — faqat haddan tashqari katta rasmlarni
        // cheklaymiz, sifat asl holiga yaqin qoladi.
        const maxSize = 2000;
        let w = img.width, h = img.height;
        if(w > h){ if(w > maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
        else     { if(h > maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
        let dataUrl;
        if(w === img.width && h === img.height && file.type === 'image/jpeg'){
          dataUrl = reader.result;
        }else{
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        }
        // Rasmni state ichiga base64 qilib emas — serverga yuklab,
        // faqat URL'ini saqlaymiz (xotirani to'ldirmaslik uchun).
        const url = await uploadDataUrlToHost(dataUrl, 'products');
        if(!url) return;
        pendingExtraImages.push(url);
        renderExtraPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function removeExtraImage(i){
  pendingExtraImages.splice(i, 1);
  renderExtraPreview();
}

function renderExtraPreview(){
  const box = document.getElementById('npExtraPreview');
  if(!box) return;
  let html = '';
  for(let k = 0; k < pendingExtraImages.length; k++){
    html += `<div class="extraImgItem">
      <img src="${pendingExtraImages[k]}" alt="">
      <button onclick="removeExtraImage(${k})">&times;</button>
    </div>`;
  }
  box.innerHTML = html;
}


/* ═══ ANALITIKA: tez hisob bo'yicha sotuv va qaytarish ═══ */
function renderTallyAnalytics(){
  const box = document.getElementById('analyticsTallyBox');
  if(!box) return;
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const t0 = d0.getTime();

  const sales = (state.sales || []).filter(function(s){ return (s.ts||0) >= t0; });
  const rets  = (Array.isArray(state.returns) ? state.returns : []).filter(function(r){ return (r.ts||0) >= t0; });

  let sQty=0, sSum=0, rQty=0, rLoss=0;
  for(let k=0;k<sales.length;k++){ sQty += sales[k].qty||1; sSum += (sales[k].total!=null?sales[k].total:(sales[k].price||0)); }
  for(let k=0;k<rets.length;k++){  rQty += rets[k].qty||0;  rLoss += rets[k].loss||0; }

  /* Qaysi mahsulot qancha sotildi */
  const byProd = {};
  for(let k=0;k<sales.length;k++){
    const s = sales[k];
    if(!byProd[s.productId]) byProd[s.productId] = {name:s.productName, qty:0, sum:0};
    byProd[s.productId].qty += s.qty||1;
    byProd[s.productId].sum += (s.total!=null?s.total:(s.price||0));
  }
  const top = Object.keys(byProd).map(function(k){ return byProd[k]; })
              .sort(function(a,b){ return b.sum-a.sum; }).slice(0,8);

  let rows = '';
  for(let k=0;k<top.length;k++){
    rows += `<div class="tallyRow">
      <div class="tRowMain"><div class="tName">${top[k].name}</div>
        <div class="tCalc">${top[k].qty} dona</div></div>
      <div class="tSum">${fmt(top[k].sum)}</div></div>`;
  }

  let retRows = '';
  for(let k=0;k<rets.length && k<8;k++){
    retRows += `<div class="tallyRow">
      <div class="tRowMain"><div class="tName">${rets[k].productName}</div>
        <div class="tCalc">${rets[k].qty} dona · yaroqsiz</div></div>
      <div class="tSum lossSum">−${fmt(rets[k].loss||0)}</div></div>`;
  }

  box.innerHTML = `
    <div class="analyticsCard">
      <div class="sectionHead" style="margin:0 0 10px;"><h2 style="font-size:15px;">Bugungi hisob</h2></div>
      <div class="tallySummary">
        <div><span>${sQty} dona</span><label>Sotildi</label></div>
        <div><span>${fmt(sSum)}</span><label>Tushum (so'm)</label></div>
        <div><span class="lossSum">${fmt(rLoss)}</span><label>Zarar (so'm)</label></div>
      </div>
      ${rows ? `<div class="anTitle">Sotilgan mahsulotlar</div><div class="tallyList" style="max-height:230px;">${rows}</div>` : ''}
      ${retRows ? `<div class="anTitle">Qaytarilgan (${rQty} dona)</div><div class="tallyList" style="max-height:190px;">${retRows}</div>` : ''}
      ${(!rows && !retRows) ? `<p class="smallMuted" style="text-align:center;margin:8px 0 0;">Bugun hali amal bajarilmagan.</p>` : ''}
    </div>`;
}


/* ═══ BUYURTMA ASOSIDA — forma maydonlarini ko'rsatish/yashirish ═══ */
function togglePreorderFields(){
  const on = document.getElementById('npPreorder');
  const box = document.getElementById('npPreorderBox');
  if(box) box.classList.toggle('hidden', !(on && on.checked));
}

/* Mahsulot oynasida buyurtma sharti bajarilganmi? */
function preorderCheck(p, qty){
  if(!p || !p.preorder) return { ok:true };
  const min = Math.max(1, Number(p.minOrder) || 1);
  if(qty < min){
    return { ok:false, min,
      msg: "Bu mahsulot buyurtma asosida tayyorlanadi.\n\nEng kam buyurtma: " +
           min + " dona.\nSiz " + qty + " dona tanladingiz." };
  }
  return { ok:true, min };
}


/* Mahsulot oynasida "buyurtma asosida" izohi */
function renderPreorderNote(p){
  let box = document.getElementById('pdPreorderNote');
  if(!box){
    const anchor = document.getElementById('pdImg');
    if(!anchor || !anchor.parentElement) return;
    box = document.createElement('div');
    box.id = 'pdPreorderNote';
    const extras = document.getElementById('pdGalExtras');
    anchor.parentElement.insertBefore(box, (extras ? extras.nextSibling : anchor.nextSibling));
  }
  if(!p || !p.preorder){ box.innerHTML = ''; box.className = ''; return; }
  const min = Math.max(1, Number(p.minOrder) || 1);
  box.className = 'preorderNote';
  box.innerHTML =
    `<div class="pnTitle">Buyurtma asosida tayyorlanadi</div>
     <div class="pnText">Bu mahsulot doimiy ishlab chiqarilmaydi — buyurtmangizga qarab tayyorlanadi.
       ${p.preorderNote ? '<br>' + p.preorderNote : ''}</div>
     <div class="pnMin">Eng kam buyurtma: <b>${min} dona</b></div>`;
}


/* ═══════════════════════════════════════════════════════════════
   TELEGRAM MINI APP
   Ilova Telegram ichida ochilganda moslashadi.
   Brauzerda ochilsa — hech narsa o'zgarmaydi.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const tg = window.Telegram && window.Telegram.WebApp;
  if(!tg || !tg.initData && !tg.platform) return;   // oddiy brauzer

  try{
    tg.ready();
    tg.expand();                       // to'liq balandlikda ochilsin
    if(tg.disableVerticalSwipes) tg.disableVerticalSwipes();  // pastga tortib yopilmasin
    document.body.classList.add('inTelegram');

    /* Telegram sarlavha rangini brendga moslash */
    try{
      if(tg.setHeaderColor) tg.setHeaderColor('#EA4E2A');
      if(tg.setBackgroundColor) tg.setBackgroundColor('#F5F1EA');
    }catch(e){}

    /* Telegram foydalanuvchisini eslab qolamiz — kelajakda avtomatik
       kirish uchun kerak bo'ladi. Hozircha faqat saqlaymiz. */
    const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if(u){
      try{
        localStorage.setItem('utam_tg_user', JSON.stringify({
          id: u.id, first_name: u.first_name || '',
          username: u.username || ''
        }));
      }catch(e){}
    }

    /* Telegram'ning o'z "orqaga" tugmasi modal yopsin */
    if(tg.BackButton){
      const anyModalOpen = () => !!document.querySelector('.modalBg:not(.hidden)');
      const sync = () => {
        if(anyModalOpen()) tg.BackButton.show(); else tg.BackButton.hide();
      };
      tg.BackButton.onClick(function(){
        const m = document.querySelector('.modalBg:not(.hidden)');
        if(m) m.classList.add('hidden');
        setTimeout(sync, 60);
      });
      setInterval(sync, 700);
    }
  }catch(e){ console.warn('Telegram WebApp:', e); }
})();


/* ═══════════════════════════════════════════════════════════════
   MAXFIY ADMIN KIRISH
   Yon menyudagi yozuvsiz qizil tugma 5 soniya bosib turiladi.
   Rang qizildan ko'kka silliq o'tadi, 5-soniyada parol so'raladi.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const HOLD_MS = 5000;
  let raf = null, startTs = 0, done = false;

  function ready(){
    const btn = document.getElementById('secretAdminBtn');
    if(!btn) return;

    /* qizil (#D0263C) -> ko'k (#0A5FCC) oralig'ida silliq o'tish */
    function colorAt(p){
      const a = [208, 38, 60], b = [10, 95, 204];
      const c = a.map((v, i) => Math.round(v + (b[i] - v) * p));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    function tick(){
      const p = Math.min(1, (Date.now() - startTs) / HOLD_MS);
      btn.style.background = colorAt(p);
      btn.style.boxShadow = `0 4px ${10 + p * 14}px rgba(${p < .5 ? '208,38,60' : '10,95,204'},${.28 + p * .3})`;
      btn.style.transform = `scale(${1 - p * 0.03})`;
      if(p >= 1){
        if(!done){
          done = true;
          stop(true);
          try{ if(navigator.vibrate) navigator.vibrate([20, 60, 20]); }catch(e){}
          closeSideMenu();
          setTimeout(function(){ openAdminLogin(); }, 220);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function start(e){
      if(e && e.cancelable) e.preventDefault();
      done = false;
      startTs = Date.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function stop(keep){
      cancelAnimationFrame(raf);
      raf = null;
      if(!keep){
        btn.style.transition = 'background .35s, box-shadow .35s, transform .25s';
        btn.style.background = '';
        btn.style.boxShadow = '';
        btn.style.transform = '';
        setTimeout(function(){ btn.style.transition = ''; }, 400);
      }
    }

    btn.addEventListener('touchstart', start, {passive:false});
    btn.addEventListener('mousedown', start);
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(function(ev){
      btn.addEventListener(ev, function(){ stop(false); });
    });
    /* kontekst menyusi chiqmasin */
    btn.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();


/* ═══════════════════════════════════════════════════════════════
   PROFIL OYNASI + ADMIN SOATI
   ═══════════════════════════════════════════════════════════════ */
function openProfileModal(){
  if(!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  const u = (state.users || []).find(x => x.id === currentUser.id);

  const av = document.getElementById('pfAvatar');
  if(u && u.photo) av.innerHTML = `<img src="${u.photo}" alt="">`;
  else av.innerHTML = ic('user', 30);

  document.getElementById('pfName').textContent =
    isAdmin ? 'Administrator' : (currentUser.name || '—');

  const typeTxt = isAdmin ? 'Administrator'
    : (u && u.userType === 'store' ? 'Magazin egasi' : "Iste'molchi");
  document.getElementById('pfRole').textContent = typeTxt;

  const rows = [];
  if(!isAdmin && u){
    if(u.contact)    rows.push(['Aloqa', u.contact]);
    if(u.personalId) rows.push(['Shaxsiy raqam', u.personalId]);
    if(u.storeName)  rows.push(['Magazin', u.storeName]);
    if(u.address)    rows.push(['Manzil', u.address]);
    if(u.userType === 'store'){
      const st = u.storeStatus || 'approved';
      rows.push(['Holati', st === 'approved' ? 'Tasdiqlangan'
                : st === 'pending' ? 'Tasdiq kutilmoqda' : 'Rad etilgan']);
    }
    if(typeof u.points === 'number') rows.push(['Ballar', fmt(u.points)]);
    if(u.createdAt) rows.push(["Ro'yxatdan o'tgan", u.createdAt]);
    const myOrders = (state.orders || []).filter(o => o.userId === currentUser.id);
    rows.push(['Buyurtmalar', myOrders.length + ' ta']);
  }else if(isAdmin){
    rows.push(['Mahsulotlar', (state.products || []).length + ' ta']);
    rows.push(["Do'konlar",   (state.stores   || []).length + ' ta']);
    rows.push(['Foydalanuvchilar', (state.users || []).length + ' ta']);
  }

  document.getElementById('pfRows').innerHTML = rows.map(r =>
    `<div class="pfRow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');

  openModal('modalProfile');
}

function confirmLogout(){
  closeModal('modalProfile');
  setTimeout(function(){
    openTallyConfirm({
      title: 'Chiqmoqchimisiz?',
      text: 'Hisobingizdan chiqasiz. Savatdagi mahsulotlar saqlanib qoladi.',
      okText: 'HA, CHIQAMAN',
      danger: true,
      onOk: function(){ logout(); }
    });
  }, 180);
}

/* ── Admin soati (yon menyu) ── */
let _clockTimer = null;

function refreshAdminClock(){
  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  const btn = document.getElementById('secretAdminBtn');
  const box = document.getElementById('adminClock');
  if(btn) btn.classList.toggle('hidden', isAdmin);
  if(box) box.classList.toggle('hidden', !isAdmin);

  clearInterval(_clockTimer);
  _clockTimer = null;
  if(!isAdmin || !box) return;

  const DAYS = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  const MONTHS = ['yanvar','fevral','mart','aprel','may','iyun',
                  'iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  function tick(){
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const t = document.getElementById('acTime');
    const s = document.getElementById('acDate');
    if(t) t.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    if(s) s.textContent = DAYS[d.getDay()] + ', ' + d.getDate() + '-' +
                          MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  tick();
  _clockTimer = setInterval(tick, 1000);
}


/* ═══════════════════════════════════════════════════════════════
   CHEKNI PRINTERDAN CHIQARISH

   Ikki yo'l:
   1) Bluetooth mini printer (ESC/POS) — Web Bluetooth orqali.
      Android Chrome va APK'da ishlaydi. iPhone Safari qo'llab-quvvatlamaydi.
   2) Wi-Fi / tizim printeri — brauzerning o'z chop etish oynasi.
      Hamma joyda ishlaydi, AirPrint ham shu orqali.
   ═══════════════════════════════════════════════════════════════ */

let btPrinter = null;      // ulangan Bluetooth printer (xotirada saqlanadi)

function printReceipt(captureId){
  const hasBT = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  openTallyConfirm({
    title: 'Qanday chiqaramiz?',
    text: hasBT
      ? '<b>Bluetooth</b> — mini chek printeri (58mm).<br><b>Wi-Fi / oddiy printer</b> — tizim printeri.'
      : 'Bu qurilma Bluetooth printerni qo\'llab-quvvatlamaydi.<br><br>' +
        '<b>Wi-Fi / oddiy printer</b> orqali chiqarish mumkin.',
    okText: hasBT ? 'BLUETOOTH PRINTER' : 'WI-FI / ODDIY PRINTER',
    noText: hasBT ? 'WI-FI / ODDIY PRINTER' : 'BEKOR QILISH',
    onOk:  function(){ hasBT ? btPrint(captureId) : systemPrint(captureId); },
    onNo:  function(){ if(hasBT) systemPrint(captureId); }
  });
}

/* ── 1-yo'l: tizim / Wi-Fi printeri ── */
function systemPrint(captureId){
  const node = document.getElementById(captureId);
  if(!node){ alert('Chek topilmadi.'); return; }

  /* MUHIM: yangi oyna OCHILMAYDI — aks holda telefonda orqaga
     qaytib bo'lmaydi. Yashirin iframe ichida chop etamiz,
     foydalanuvchi ilovadan chiqmaydi. */
  const old = document.getElementById('printFrame');
  if(old) old.remove();

  const f = document.createElement('iframe');
  f.id = 'printFrame';
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:1px;border:0;opacity:0;';
  document.body.appendChild(f);

  const css = Array.prototype.slice.call(document.querySelectorAll('link[rel=stylesheet]'))
    .map(function(l){ return '<link rel="stylesheet" href="' + l.href + '">'; }).join('');

  const doc = f.contentWindow.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Chek</title>' + css +
    '<style>body{margin:0;padding:6px;background:#fff;}' +
    '@page{size:80mm auto;margin:3mm;}' +
    '@media print{body{padding:0;}}</style></head><body>' +
    node.outerHTML + '</body></html>');
  doc.close();

  /* rasm va uslublar yuklanishini kutamiz */
  setTimeout(function(){
    try{
      f.contentWindow.focus();
      f.contentWindow.print();
    }catch(e){
      console.warn('Chop etish:', e);
      alert("Chop etish oynasi ochilmadi.\n\nQurilmangizda printer sozlanganini tekshiring.");
    }
    /* iframe'ni keyinroq olib tashlaymiz */
    setTimeout(function(){ const el = document.getElementById('printFrame'); if(el) el.remove(); }, 8000);
  }, 900);
  closeReceiptAfterPrint();
}

/* Chop etishga yuborilgach chek oynasi o'zi yopiladi */
function closeReceiptAfterPrint(){
  /* Barcha chek oynalarini yopamiz — qaysi biri ochiq ekanini
     tekshirib o'tirmaymiz, shunchaki hammasini yopamiz. */
  ['modalCalcReceipt', 'modalReceipt', 'modalPrintShop'].forEach(function(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.add('hidden');
    if(id === 'modalCalcReceipt'){
      try{ if(typeof onCalcReceiptClosed === 'function') onCalcReceiptClosed(); }catch(e){}
    }
  });
}

/* ── 2-yo'l: Bluetooth ESC/POS printer ── */
/* Arzon BLE chek printerlarida uchraydigan xizmatlar.
   YHK seriyasi (YHK-2BOA va shu kabilar) ISSC UART ishlatadi. */
const PRINTER_SERVICES = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',   // ISSC UART — YHK, Goojprt
  '000018f0-0000-1000-8000-00805f9b34fb',   // ko'p 58mm printerlar
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',   // HM-10 / CC254x
  '0000ae30-0000-1000-8000-00805f9b34fb',   // PeriPage
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2'    // cat printer
];
/* ISSC'da aynan shu kanalga yoziladi */
const ISSC_WRITE_CHAR = '49535343-8841-43f4-a8d4-ecbe34729bb3';

async function btPrint(captureId){
  try{
    if(!btPrinter || !btPrinter.gatt || !btPrinter.gatt.connected){
      btPrinter = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES
      });
    }
    const server = await btPrinter.gatt.connect();
    const ch = await findWriteChar(server);
    if(!ch){
      alert("Printerda yozish kanali topilmadi.\n\n" +
            "Printer o'chiq yoki boshqa qurilmaga ulangan bo'lishi mumkin.");
      return;
    }

    await sendToPrinter(ch, buildEscPos(captureId));
    closeReceiptAfterPrint();
    alert('Чек отправлен на принтер.');
  }catch(e){
    if(e && e.name === 'NotFoundError') return;
    console.warn('Bluetooth print:', e);
    alert("Printerga ulanib bo'lmadi.\n\n" + (e && e.message ? e.message : ''));
  }
}

async function findWriteChar(server){
  /* Avval ma'lum ISSC kanalini sinaymiz — YHK printerlar shuni ishlatadi */
  try{
    const svc = await server.getPrimaryService(PRINTER_SERVICES[0]);
    const c = await svc.getCharacteristic(ISSC_WRITE_CHAR);
    if(c) return c;
  }catch(e){ /* boshqa turdagi printer — pastda qidiramiz */ }

  let services = [];
  try{ services = await server.getPrimaryServices(); }catch(e){ return null; }
  for(const s of services){
    let chars = [];
    try{ chars = await s.getCharacteristics(); }catch(e){ continue; }
    for(const c of chars){
      if(c.properties && (c.properties.write || c.properties.writeWithoutResponse)) return c;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   ESC/POS: matnni CP866 kodlashda yuboramiz.

   MUHIM: termal printerlar UTF-8 ni TUSHUNMAYDI. UTF-8 yuborilsa
   qog'oz oq chiqadi yoki tushunarsiz belgilar bosiladi.
   Rus tili uchun CP866 (kod sahifasi 17) ishlatiladi.
   ═══════════════════════════════════════════════════════════════ */

/* Kirill harflarini CP866 baytlariga o'giradi */
function cp866Byte(ch){
  const c = ch.charCodeAt(0);
  if(c < 0x80) return c;                          // ASCII — o'zgarishsiz
  if(c >= 0x410 && c <= 0x43F) return c - 0x410 + 0x80;   // А..п
  if(c >= 0x440 && c <= 0x44F) return c - 0x440 + 0xE0;   // р..я
  if(c === 0x401) return 0xF0;                    // Ё
  if(c === 0x451) return 0xF1;                    // ё
  /* O'zbek va boshqa maxsus belgilar — eng yaqin ASCII */
  const map = {
    'ʼ':39, '‘':39, '’':39, '`':39, '´':39,
    '“':34, '”':34, '«':60, '»':62,
    '–':45, '—':45, '·':42, '№':35,
    'ў':0xE3, 'Ў':0x93, 'қ':0xAA, 'Қ':0x8A,
    'ғ':0xA3, 'Ғ':0x83, 'ҳ':0xE5, 'Ҳ':0x95,
    'о':0xAE, 'О':0x8E
  };
  if(map[ch] !== undefined) return map[ch];
  return 0x3F;                                    // '?' — noma'lum belgi
}

function cp866(text){
  const out = [];
  for(const ch of String(text)) out.push(cp866Byte(ch));
  return out;
}

/* Chek matnini ESC/POS baytlariga aylantiradi (58mm — 32 belgi) */
function buildEscPos(captureId){
  const node = document.getElementById(captureId);
  const W = 32;
  const out = [];
  const push = arr => { for(const b of arr) out.push(b); };
  const line = txt => { push(cp866(txt)); push([0x0A]); };

  push([0x1B, 0x40]);              // reset
  push([0x1B, 0x74, 0x11]);        // kod sahifasi 17 = CP866 (rus tili)
  push([0x1C, 0x2E]);              // ko'p baytli rejimni o'chirish
  push([0x1B, 0x61, 0x01]);        // markazga

  const shop = (state.sellerInfo && state.sellerInfo.name) || "UNUTILMAS TA'M";
  push([0x1B, 0x21, 0x30]); line(shop); push([0x1B, 0x21, 0x00]);
  const phone = (state.sellerInfo && state.sellerInfo.phone) || '';
  if(phone) line(phone);
  line('-'.repeat(W));
  push([0x1B, 0x61, 0x00]);        // chapga

  const rows = node ? node.querySelectorAll('.rItemRow') : [];
  rows.forEach(function(r){
    const name = ((r.querySelector('.riName') || {}).textContent || '').trim();
    const qty  = ((r.querySelector('.riQty')  || {}).textContent || '').trim();
    const sum  = ((r.querySelector('.riPrice')|| {}).textContent || '').trim();
    line(name.slice(0, W));
    const pad = Math.max(1, W - qty.length - sum.length);
    line(qty + ' '.repeat(pad) + sum);
  });

  line('-'.repeat(W));
  if(node) node.querySelectorAll('.rSumRow').forEach(function(r){
    const sp = r.querySelectorAll('span');
    if(sp.length < 2) return;
    const a = sp[0].textContent.trim(), b = sp[1].textContent.trim();
    const pad = Math.max(1, W - a.length - b.length);
    line(a + ' '.repeat(pad) + b);
  });

  const tot = node && node.querySelector('#crTotalAmt, #rTotalAmt, .rTotalAmt');
  if(tot){
    line('='.repeat(W));
    push([0x1B, 0x21, 0x20]);
    line(('ИТОГО: ' + tot.textContent.trim()).slice(0, W));
    push([0x1B, 0x21, 0x00]);
  }

  push([0x1B, 0x61, 0x01]);
  line('');
  line(new Date().toLocaleString('ru-RU'));
  line('Спасибо за покупку!');
  line('Xaridingiz uchun rahmat!');
  line(''); line(''); line('');
  push([0x1D, 0x56, 0x42, 0x00]);  // qog'ozni kesish

  return new Uint8Array(out);
}


/* ═══ PRINTERNI SINASH ═══
   Yon menyudan chaqiriladi. Qisqa sinov chekini chiqaradi. */
async function testPrinter(){
  if(!(navigator.bluetooth && navigator.bluetooth.requestDevice)){
    alert("Bu qurilma Bluetooth printerni qo'llab-quvvatlamaydi.\n\n" +
          "iPhone/iPad'da App Store'dan «Bluefy» brauzerini o'rnatib, " +
          "saytni o'sha yerda oching.");
    return;
  }
  try{
    if(!btPrinter || !btPrinter.gatt || !btPrinter.gatt.connected){
      btPrinter = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, optionalServices: PRINTER_SERVICES
      });
    }
    const server = await btPrinter.gatt.connect();
    const ch = await findWriteChar(server);
    if(!ch){ alert("Yozish kanali topilmadi."); return; }

    const out = [];
    const push = a => { for(const b of a) out.push(b); };
    const line = t => { push(cp866(t)); push([0x0A]); };

    push([0x1B, 0x40]);
    push([0x1B, 0x74, 0x11]);      // CP866 — kirill uchun
    push([0x1C, 0x2E]);
    push([0x1B, 0x61, 0x01]);
    push([0x1B, 0x21, 0x30]);
    line("UNUTILMAS TA'M");
    push([0x1B, 0x21, 0x00]);
    line('-'.repeat(32));
    line('ТЕСТОВЫЙ ЧЕК');
    line(new Date().toLocaleString('ru-RU'));
    line('Printer: ' + (btPrinter.name || '-'));
    line('-'.repeat(32));
    line('Если вы это читаете —');
    line('принтер работает.');
    line(''); line(''); line('');
    push([0x1D, 0x56, 0x42, 0x00]);

    await sendToPrinter(ch, new Uint8Array(out));
    alert('Тестовый чек отправлен.\n\nПринтер: ' + (btPrinter.name || '-'));
  }catch(e){
    if(e && e.name === 'NotFoundError') return;
    alert("Ulanib bo'lmadi.\n\n" + (e && e.message ? e.message : ''));
  }
}

/* Ma'lumotni 20 baytlik bo'laklarda yuboradi */
async function sendToPrinter(ch, bytes, onProgress){
  /* MUHIM: arzon BLE printerlarning buferi juda kichik.
     Tez yuborilsa bufer to'lib, chek YARMIDA to'xtab qoladi.

     Shuning uchun:
       • kichik bo'lak (100 bayt)
       • "javob bilan yozish" (writeValue) — printer tayyor bo'lguncha kutadi
       • har 2 KB dan keyin qo'shimcha tanaffus — bosib ulgursin */
  const CHUNK = 100;
  let sincePause = 0;

  for(let i = 0; i < bytes.length; i += CHUNK){
    const part = bytes.slice(i, i + CHUNK);

    let ok = false;
    for(let attempt = 0; attempt < 3 && !ok; attempt++){
      try{
        await ch.writeValue(part);      // javob kutiladi — oqim nazorati
        ok = true;
      }catch(err){
        await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
      }
    }

    sincePause += part.length;
    if(sincePause >= 2048){
      sincePause = 0;
      await new Promise(r => setTimeout(r, 160));   // printer bosib ulgursin
    }else{
      await new Promise(r => setTimeout(r, 12));
    }

    if(onProgress) onProgress((i + part.length) / bytes.length);
  }

  /* Oxirida printer buferini bo'shatishga vaqt beramiz */
  await new Promise(r => setTimeout(r, 400));
}
