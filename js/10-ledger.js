/* Unutilmas Ta'm — 10-ledger
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function totalDebtAll(){
  return state.ledger.reduce((s,l)=>s+l.debt,0);
}

function salesInRange(fromTs, toTs){
  return state.sales.filter(s=>s.ts>=fromTs && (toTs==null || s.ts<toTs));
}

/* ---- Savdo grafigi: so'nggi 7 kunlik tushum ---- */
function renderSalesChart(){
  const box = document.getElementById('salesChart');
  if(!box) return;
  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    const dayStart = d.getTime(); const dayEnd = dayStart + 86400000;
    const revenue = state.sales.filter(s=>s.ts>=dayStart && s.ts<dayEnd).reduce((s,x)=>s+x.price,0);
    days.push({label: d.toLocaleDateString('uz-UZ',{day:'2-digit',month:'2-digit'}), revenue});
  }
  const maxRev = Math.max(1, ...days.map(d=>d.revenue));
  box.innerHTML = `<div class="chartBars">` + days.map(d=>`
    <div class="chartBarCol">
      <div class="chartBarWrap"><div class="chartBar" style="height:${Math.max(3,(d.revenue/maxRev*100)).toFixed(0)}%"></div></div>
      <div class="chartBarLbl">${d.label}</div>
    </div>
  `).join('') + `</div>`;
}

/* ---- Xarajatlar va sof foyda ---- */
function renderExpenses(){
  const box = document.getElementById('expensesList');
  if(!box) return;
  const now = new Date();
  let fromTs;
  if(analyticsPeriod==='day'){ const d=new Date(); d.setHours(0,0,0,0); fromTs=d.getTime(); }
  else if(analyticsPeriod==='week'){ fromTs = nowTs()-7*86400000; }
  else { fromTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }

  const periodExpenses = (state.expenses||[]).filter(e=>new Date(e.date).getTime()>=fromTs);
  const totalExpenses = periodExpenses.reduce((s,e)=>s+e.amount,0);
  const periodRevenue = salesInRange(fromTs).reduce((s,x)=>s+x.price,0);
  const netProfit = periodRevenue - totalExpenses;

  const npEl = document.getElementById('netProfitSum');
  npEl.textContent = fmt(netProfit) + " so'm";
  npEl.style.color = netProfit>=0 ? 'var(--success)' : 'var(--danger)';

  box.innerHTML = periodExpenses.map(e=>`
    <div class="sessionRow">
      <span><b>${e.title}</b> <span class="smallMuted">(${e.date.slice(0,10)})</span></span>
      <span style="display:flex;align-items:center;gap:8px;">
        <b style="color:var(--danger);">-${fmt(e.amount)} so'm</b>
        <button class="ghostBtn" style="padding:5px 8px;" onclick="deleteExpense('${e.id}')">${ic('trash',12)}</button>
      </span>
    </div>
  `).join('') || emptyHtml('card',"Bu davrda xarajat kiritilmagan");
}

function openExpenseModal(){
  document.getElementById('expTitle').value = '';
  document.getElementById('expAmount').value = '';
  openModal('modalExpense');
}

async function createExpense(){
  const title = document.getElementById('expTitle').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  if(!title){ alert('Xarajat nomini kiriting'); return; }
  if(isNaN(amount) || amount<=0){ alert("Summani to'g'ri kiriting"); return; }
  state.expenses.push({id:uid('exp'), title, amount, date: todayISO()});
  await saveState();
  closeModal('modalExpense');
  renderExpenses();
}

async function deleteExpense(id){
  if(!confirm("Bu xarajatni o'chirmoqchimisiz?")) return;
  state.expenses = state.expenses.filter(e=>e.id!==id);
  await saveState();
  renderExpenses();
}

/* ==================== LEDGER / DEBTS (admin: edit/delete) ==================== */
function ledgerRowHtml(l, editable){
  const overdue = l.debt>0 && l.due && l.due < todayISO();
  return `<div class="card debtRow ${l.debt<=0?'paid':''}" onclick="openLedgerDetail('${l.id}')" style="cursor:pointer;">
    <div class="row"><div class="title">${l.partyName||'Sotuv'}</div><span class="badge ${l.debt>0?'red':'green'}">${l.debt>0?fmt(l.debt)+" so'm qarz":'To\'langan'}</span></div>
    ${l.ownerName?`<div class="meta">Egasi: ${l.ownerName}</div>`:''}
    ${itemChipsHtml(l.items)}
    ${moneyPillsHtml(l,{overdue})}
    <div class="meta" style="margin-top:8px;">Sana: ${l.date} ${l.due?('· Muddat: '+l.due):''}${overdue?' · <b style="color:var(--danger);">Muddati o\'tgan!</b>':''}</div>
    ${l.deliveryTime?`<div class="meta">Yetkazish: ${fmtDeliveryTime(l.deliveryTime)}</div>`:''}
    ${editable && currentUser && currentUser.role==='admin' ? `<button class="ghostBtn" style="width:100%;margin-top:9px;" onclick="event.stopPropagation(); openEditLedger('${l.id}')">${ic('edit',13)}Tahrirlash</button>`:''}
  </div>`;
}

function openLedgerDetail(ledgerId){
  const l = state.ledger.find(x=>x.id===ledgerId);
  if(!l) return;
  const s = state.stores.find(x=>x.id===l.partyId);
  const overdue = l.debt>0 && l.due && l.due < todayISO();
  document.getElementById('ledgerDetailBody').innerHTML = `
    <div class="statGrid" style="grid-template-columns:1fr;">
      <div class="statCard ${l.debt>0?'warn':''}"><div class="num">${l.debt>0?fmt(l.debt)+" so'm":'To\'langan'}</div><div class="lbl">${l.debt>0?'Qolgan qarz':'Holati'}</div></div>
    </div>
    <div class="card">
      <div class="meta"><b>Do'kon / mijoz:</b> ${l.partyName}</div>
      ${l.ownerName?`<div class="meta"><b>Egasi:</b> ${l.ownerName}</div>`:''}
      ${s&&s.phone?`<div class="meta"><b>Telefon:</b> ${s.phone}</div>`:''}
      ${s&&s.address?`<div class="meta"><b>Manzil:</b> ${s.address}</div>`:''}
      <div class="meta" style="margin-bottom:2px;"><b>Mahsulotlar:</b></div>
      ${itemChipsHtml(l.items)}
      ${moneyPillsHtml(l,{overdue})}
      <div class="meta" style="margin-top:10px;"><b>Sana:</b> ${l.date}</div>
      ${l.deliveryTime?`<div class="meta"><b>Yetkazib berish vaqti:</b> ${fmtDeliveryTime(l.deliveryTime)}</div>`:''}
      ${l.due?`<div class="meta"><b>Qarz muddati:</b> ${l.due}${overdue?' · <b style="color:var(--danger);">muddati o\'tgan!</b>':''}</div>`:''}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
      ${l.debt>0?`<button class="ghostBtn" style="flex:1;" onclick="closeModal('modalLedgerDetail');openPay('${l.partyType}','${l.partyId}','${l.partyName}')">${ic('card',13)}To'lov qabul qilish</button>`:''}
      <button class="ghostBtn" style="flex:1;" onclick="closeModal('modalLedgerDetail');openEditLedger('${l.id}')">${ic('edit',13)}Tahrirlash</button>
      ${l.debt>0?`<button class="ghostBtn" style="flex:1;" onclick="closeModal('modalLedgerDetail');openDebtMessageModal('${l.id}')">${ic('bell',13)}Xabar yuborish</button>`:''}
    </div>
    ${s?`<button class="primaryBtn" onclick="openYandexNavigator(${s.lat}, ${s.lng}, '${(s.name||'').replace(/'/g,"")}')">${ic('pin',15)}Magazinga borish</button>`:''}
  `;
  openModal('modalLedgerDetail');
}

function debtRowHtml(l){
  const today = todayISO();
  const overdue = l.due && l.due < today;
  return `<div class="card debtRow" style="${overdue?'background:#FFF6F5;':''}">
    <div class="row">
      <div class="title">${l.partyName}</div>
      <span class="badge red" style="${overdue?'animation:pulseSoft 2.2s ease-in-out infinite;':''}">${fmt(l.debt)} so'm</span>
    </div>
    ${itemChipsHtml(l.items)}
    <div class="meta" style="margin-top:8px;">Muddat: ${l.due||'—'} ${overdue?' · <b style="color:#EF4B62;">Muddati o\'tgan!</b>':''}</div>
  </div>`;
}

function isDebtDueSoon(l){
  if(!l.due) return false;
  const today = new Date(todayISO());
  const soonLimit = new Date(today); soonLimit.setDate(soonLimit.getDate()+3);
  const due = new Date(l.due);
  return due <= soonLimit; // muddati o'tgan yoki 3 kun ichida tugaydigan qarzlar
}

function qarzColorFor(name){
  let h=0; for(let i=0;i<(name||'').length;i++) h = (h*31 + name.charCodeAt(i))>>>0;
  return QARZ_COLORS[h % QARZ_COLORS.length];
}

function openDebtMessageModal(ledgerId){
  debtMsgLedgerId = ledgerId;
  const l = state.ledger.find(x=>x.id===ledgerId);
  const s = state.stores.find(x=>x.id===l.partyId);
  const defaultMsg = `Assalomu alaykum, ${l.ownerName||l.partyName}! "${l.partyName}" nomidagi qarzingiz ${fmt(l.debt)} so'm${l.due?(', muddati: '+l.due):''}. Iltimos, imkon qadar tezroq to'lang. Rahmat! — Unutilmas Ta'm`;
  document.getElementById('dmText').value = defaultMsg;
  document.getElementById('dmPhone').innerHTML = `${ic('phone',12)} ${s&&s.phone ? s.phone : 'Telefon raqami kiritilmagan'}`;
  const ownerUser = s && s.ownerUserId ? state.users.find(u=>u.id===s.ownerUserId) : null;
  document.getElementById('dmAppStatus').innerHTML = ownerUser
    ? `${ic('check',12)} Ilovada ro'yxatdan o'tgan: <b>${ownerUser.name}</b> — xabarni ilova orqali ham yuborishingiz mumkin.`
    : `${ic('alert',12)} Bu do'kon egasi ilovada ro'yxatdan o'tmagan — faqat SMS yoki WhatsApp orqali yuboring.`;
  openModal('modalDebtMessage');
}

async function sendDebtMessageInApp(){
  const l = state.ledger.find(x=>x.id===debtMsgLedgerId);
  const s = state.stores.find(x=>x.id===l.partyId);
  const ownerUser = s && s.ownerUserId ? state.users.find(u=>u.id===s.ownerUserId) : null;
  const msg = document.getElementById('dmText').value.trim();
  if(!msg){ alert('Xabar matnini kiriting'); return; }
  if(!ownerUser){ alert('Bu foydalanuvchi ilovada ro\'yxatdan o\'tmagan. SMS yoki WhatsApp tugmasidan foydalaning.'); return; }
  await pushNotification(ownerUser.id, 'Qarz haqida eslatma', msg, 'debt', {type:'debt', id:l.id});
  alert('Xabar ilova orqali yuborildi.');
  closeModal('modalDebtMessage');
}

function sendDebtMessageSms(){
  const l = state.ledger.find(x=>x.id===debtMsgLedgerId);
  const s = state.stores.find(x=>x.id===l.partyId);
  const msg = document.getElementById('dmText').value.trim();
  if(!s || !s.phone){ alert('Telefon raqami kiritilmagan'); return; }
  window.location.href = `sms:${s.phone}?body=${encodeURIComponent(msg)}`;
}

function sendDebtMessageWhatsapp(){
  const l = state.ledger.find(x=>x.id===debtMsgLedgerId);
  const s = state.stores.find(x=>x.id===l.partyId);
  const msg = document.getElementById('dmText').value.trim();
  if(!s || !s.phone){ alert('Telefon raqami kiritilmagan'); return; }
  const cleanPhone = s.phone.replace(/[^\d]/g,'');
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function openEditLedger(ledgerId){
  editingLedgerId = ledgerId;
  const l = state.ledger.find(x=>x.id===ledgerId);
  if(!l) return;
  /* Chekdan yozilgan qarzda mahsulotlar ro'yxati bo'lmasligi mumkin —
     ilgari shu sabab oyna umuman ochilmasdi */
  const itemsTxt = (l.items || []).map(i=>i.name+'×'+i.qty).join(', ');
  document.getElementById('editLedgerSummary').textContent =
    (l.partyName || '') + (itemsTxt ? ': ' + itemsTxt : '') + (l.note ? ' — ' + l.note : '');
  document.getElementById('elTotal').value = l.total || 0;
  document.getElementById('elPaid').value = l.paid || 0;
  document.getElementById('elDue').value = l.due || '';
  openModal('modalEditLedger');          // magazin oynasi ostida qoladi
}

async function confirmEditLedger(){
  const l = state.ledger.find(x=>x.id===editingLedgerId);
  l.total = parseFloat(document.getElementById('elTotal').value)||0;
  l.paid = parseFloat(document.getElementById('elPaid').value)||0;
  l.due = document.getElementById('elDue').value;
  l.debt = Math.max(l.total-l.paid,0);
  l.status = l.debt<=0 ? 'paid' : 'debt';
  await saveState();
  closeModal('modalEditLedger');
  renderDebtsAdmin(); renderStores(); renderDash();
  if(typeof refreshStoreDetailIfOpen === 'function') refreshStoreDetailIfOpen();
}

async function deleteLedger(){
  if(!confirm('Bu yozuvni o\'chirmoqchimisiz?')) return;
  state.ledger = state.ledger.filter(x=>x.id!==editingLedgerId);
  await saveState();
  closeModal('modalEditLedger');
  renderDebtsAdmin(); renderStores(); renderDash();
  if(typeof refreshStoreDetailIfOpen === 'function') refreshStoreDetailIfOpen();
}
