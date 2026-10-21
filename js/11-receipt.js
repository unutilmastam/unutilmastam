/* Unutilmas Ta'm — 11-receipt
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

/* Eski versiyada mahsulot rasmlari siqilmasdan saqlanardi (ba'zan 2-5MB).
   Bu Firestore hujjat chegarasi (1MB) va telefon xotirasidan (localStorage) oshib,
   saqlash sezilmasdan barbod bo'lishiga sabab bo'lgan. Bu funksiya shunday rasmlarni
   topib, avtomatik siqadi va qayta saqlaydi — foydalanuvchi hech narsa qilishi shart emas. */
async function migrateOversizedImages(){
  try{
    const BIG = 220000; // ~165KB dan katta bo'lsa, demak siqilmagan xom rasm
    const targets = (state.products||[]).filter(p=>p.image && p.image.length > BIG);
    if(targets.length){
      console.warn('Siqilmagan', targets.length, 'ta mahsulot rasmi topildi, avtomatik siqilmoqda...');
      await Promise.all(targets.map(p=>new Promise(resolve=>{
        const img = new Image();
        img.onload = ()=>{
          const maxSize = 640;
          let w = img.width, h = img.height;
          if(w>h){ if(w>maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
          else { if(h>maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img,0,0,w,h);
          p.image = canvas.toDataURL('image/jpeg', 0.74);
          resolve();
        };
        img.onerror = resolve;
        img.src = p.image;
      })));
      await saveState();
      try{ renderProducts(); renderCatalog(); }catch(e){}
      console.warn('Tuzatildi: rasmlar siqildi va qayta saqlandi.');
    }
    // Endi eskidan base64 (data:...) holida qolgan mahsulot rasmlarini
    // serverga (uploads/) ko'chirib, state ichida faqat URL qoldiramiz —
    // shunda avval to'plangan eski og'irlik ham asta-sekin tozalanadi.
    await migrateBase64ImagesToHost();
  }catch(e){ console.warn('Rasm migratsiyasida xato:', e); }
}

async function migrateBase64ImagesToHost(){
  if(typeof uploadDataUrlToHost !== 'function') return;
  const isBase64 = v => typeof v === 'string' && v.indexOf('data:') === 0;
  const prods = (state.products||[]).filter(p=>isBase64(p.image) || (Array.isArray(p.images) && p.images.some(isBase64)));
  if(!prods.length) return;
  console.warn(prods.length, 'ta mahsulotning eski (base64) rasmi serverga ko\'chirilmoqda...');
  let changed = false;
  for(const p of prods){
    if(isBase64(p.image)){
      const url = await uploadDataUrlToHost(p.image, 'products', true);
      if(url){ p.image = url; changed = true; }
    }
    if(Array.isArray(p.images)){
      for(let i=0;i<p.images.length;i++){
        if(isBase64(p.images[i])){
          const url = await uploadDataUrlToHost(p.images[i], 'products', true);
          if(url){ p.images[i] = url; changed = true; }
        }
      }
    }
  }
  if(changed){
    await saveState();
    try{ renderProducts(); renderCatalog(); }catch(e){}
    console.warn('Tuzatildi: eski rasmlar serverga ko\'chirildi.');
  }
}

function igOnScroll(){
  const c = document.getElementById('igCarousel');
  const i = Math.round(c.scrollLeft / c.clientWidth);
  document.querySelectorAll('#igDots .igDot').forEach((d,idx)=>d.classList.toggle('active', idx===i));
}

/* Elementga aylanib o'tib, yorqin ta'kidlash (foydalanuvchi qayerga tushganini ko'rsin) */
function scrollToAndFlash(elId, expandParent){
  const target = document.getElementById(elId);
  const card = target ? (target.closest('.card')||target) : null;
  if(!card) return;
  card.scrollIntoView({behavior:'smooth', block:'center'});
  card.classList.add('flashHighlight');
  setTimeout(()=>card.classList.remove('flashHighlight'), 1800);
}

/* ============================================================
   BUYURTMA CHEKI — faqat "Yetkazildi" bo'lgandan keyin ochiladi
   ============================================================ */
function openReceiptModal(orderId){
  /* CHEK FAQAT ADMIN UCHUN — mijozlarga ko'rinmaydi */
  if(!currentUser || currentUser.role!=='admin'){ return; }
  const o = state.orders.find(x=>x.id===orderId);
  if(!o){ alert("Buyurtma topilmadi"); return; }
  if(o.status!=='yetkazildi'){ alert("Chek faqat buyurtma yetkazib berilgandan keyin ko'rinadi"); return; }

  const dateSrc = o.deliveredAt ? new Date(o.deliveredAt) : new Date(o.date);
  const dateTxt = dateSrc.toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const chekNo = 'UT-' + dateSrc.toISOString().slice(0,10).replace(/-/g,'') + '-' + o.id.split('_').pop().slice(0,4).toUpperCase();

  document.getElementById('rChekNo').textContent = '#' + chekNo;
  document.getElementById('rDate').textContent = dateTxt;
  document.getElementById('rType').textContent = o.orderType==='dokon' ? "Do'kon uchun" : 'Yetkazib berish';

  document.getElementById('rCustName').textContent = o.customerName || 'Mijoz';
  document.getElementById('rCustSub').textContent = [o.customerPhone, o.storeAddress].filter(Boolean).join(' · ');

  const rLogo = document.getElementById('receiptLogoImg');
  if(rLogo){ rLogo.src = getAppLogo(); rLogo.alt = "Unutilmas Ta'm"; }

  document.getElementById('rItemsList').innerHTML = (o.items||[]).map(i=>`
    <div class="rItemRow">
      <div><div class="riName">${i.name}</div><div class="riQty">${i.qty} x ${fmt(i.price)} so'm</div></div>
      <div class="riPrice">${fmt(i.price*i.qty)}</div>
    </div>
  `).join('');

  const subtotal = o.subtotal || (o.items||[]).reduce((s,i)=>s+i.price*i.qty,0);
  let sumsHtml = `<div class="rSumRow"><span>Mahsulotlar summasi</span><span>${fmt(subtotal)} so'm</span></div>`;
  if(o.promoCode) sumsHtml += `<div class="rSumRow discount"><span>Promo-kod (${o.promoCode.code})</span><span>-${o.promoCode.discountPercent}%</span></div>`;
  if(o.pointsUsed) sumsHtml += `<div class="rSumRow discount"><span>Ball chegirmasi</span><span>-${fmt(o.pointsUsed*100)} so'm</span></div>`;
  if(o.deliveryFee) sumsHtml += `<div class="rSumRow"><span>Yetkazish${o.deliveryZoneName?' ('+o.deliveryZoneName+')':''}</span><span>+${fmt(o.deliveryFee)} so'm</span></div>`;
  document.getElementById('rSumsList').innerHTML = sumsHtml;
  document.getElementById('rTotalAmt').textContent = fmt(o.total) + " so'm";

  const payTxt = o.paymentStatus==='tolandi' ? "✓ To'langan" : (o.debt>0 ? '✓ Qarzga' : "✓ To'langan (naqd)");
  document.getElementById('rPayBadge').textContent = payTxt;

  const courierBox = document.getElementById('rCourierBox');
  if(o.courierId){
    const courier = (state.couriers||[]).find(c=>c.id===o.courierId);
    if(courier){
      courierBox.classList.remove('hidden');
      document.getElementById('rCourierAvatar').innerHTML = courier.photo ? `<img src="${courier.photo}">` : (courier.name[0]||'?').toUpperCase();
      document.getElementById('rCourierName').textContent = courier.name;
      document.getElementById('rCourierMeta').textContent = 'Kuryer · ' + dateTxt.split(', ')[1] + ' da yetkazdi';
    } else courierBox.classList.add('hidden');
  } else courierBox.classList.add('hidden');

  const qrBox = document.getElementById('rQrCode');
  qrBox.innerHTML = '';
  try{
    new QRCode(qrBox, {
      text: location.origin + location.pathname + '?chek=' + o.id,
      width: 170, height: 170,
      colorDark: '#1C1712', colorLight: '#ffffff',
      correctLevel: (window.QRCode && QRCode.CorrectLevel) ? QRCode.CorrectLevel.M : undefined
    });
  }catch(e){ console.warn('QR kod generatsiyasida xato:', e); }

  openModal('modalReceipt');
}

async function downloadReceiptPdf(btn){
  if(typeof captureReceipt !== 'function' || typeof window.jspdf === 'undefined'){
    alert("PDF yaratish vositasi hali yuklanmagan. Bir marta internetli holatda ilovani oching — shundan keyin internetsiz ham ishlaydi.");
    return;
  }
  setDlBtnLoading(btn, true, 'Tayyorlanmoqda...');
  try{
    const canvas = await captureReceipt('receiptCapture');
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pxToMm = px => px * 0.264583;
    const pdfW = pxToMm(canvas.width);
    const pdfH = pxToMm(canvas.height);
    const pdf = new jsPDF({ orientation: pdfH >= pdfW ? 'portrait' : 'landscape', unit: 'mm', format: [pdfW, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    const blob = pdf.output('blob');
    await triggerFileSave(blob, 'chek.pdf', 'application/pdf');
  }catch(e){
    alert("PDF yaratishda xato: " + (e.message||e));
  }finally{
    setDlBtnLoading(btn, false);
  }
}

async function downloadReceiptImage(btn){
  /* Printerga chiqadigan chek bilan BIR XIL ko'rinish uchun xuddi shu
     rasmga-olish funksiyasidan foydalanamiz (16-rasterprint.js),
     oddiy ekran rasmini emas. */
  if(typeof captureReceipt !== 'function'){ alert("Rasm yaratish vositasi hali yuklanmagan. Bir marta internetli holatda ilovani oching — shundan keyin internetsiz ham ishlaydi."); return; }
  setDlBtnLoading(btn, true, 'Tayyorlanmoqda...');
  try{
    const canvas = await captureReceipt('receiptCapture');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if(!blob) throw new Error('Rasm yaratilmadi');
    await triggerFileSave(blob, 'chek.png', 'image/png');
  }catch(e){
    alert("Rasm yaratishda xato: " + (e.message||e));
  }finally{
    setDlBtnLoading(btn, false);
  }
}

function openCalculator(){
  calcQty = {};
  calcMode = 'store';
  syncCalcModeUI();
  renderCalculator();
  openModal('modalCalculator');
}

/* Iste'molchi <-> Magazin narxi almashtirish */
function setCalcMode(m){
  if(m!=='customer' && m!=='store') return;
  calcMode = m;
  syncCalcModeUI();
  renderCalculator();          // narxlar qayta chiziladi
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){}
}

function syncCalcModeUI(){
  const a=document.getElementById('calcModeBtnCustomer');
  const b=document.getElementById('calcModeBtnStore');
  if(a) a.classList.toggle('active', calcMode==='customer');
  if(b) b.classList.toggle('active', calcMode==='store');
}

function renderCalculator(){
  const box = document.getElementById('calcProductList');
  box.innerHTML = (state.products||[]).map(p=>{
    const qty = calcQty[p.id]||0;
    return `<div class="sessionRow basketRow">
      <span style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="prodThumbSm" style="width:30px;height:30px;flex-shrink:0;">${prodThumb(p,13)}</span>
        <span style="min-width:0;overflow:hidden;">
          <b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</b>
          <span class="smallMuted" style="font-size:11px;">${formatProductAmount(p)}</span>
        </span>
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div class="pdQtyBox" style="padding:2px;">
          <button onclick="calcChangeQty('${p.id}',-1)" style="width:28px;height:28px;">${ic('minus',12)}</button>
          <input type="tel" inputmode="numeric" value="${qty}" style="width:32px;font-size:14px;" onfocus="this.select()" oninput="calcQtyInput('${p.id}',this)" onblur="calcQtyBlur('${p.id}',this)">
          <button onclick="calcChangeQty('${p.id}',1)" style="width:28px;height:28px;">${ic('plus',12)}</button>
        </div>
        <b style="min-width:82px;text-align:right;font-size:13.5px;">${fmt(priceOf(p,calcMode)*qty)} so'm</b>
      </span>
    </div>`;
  }).join('') || emptyHtml('box', "Mahsulot yo'q");
  updateCalcTotal();
}

function updateCalcTotal(){
  let sum = 0, kinds = 0;
  Object.keys(calcQty).forEach(pid=>{
    const p = state.products.find(x=>x.id===pid);
    if(p && calcQty[pid]>0){ sum += priceOf(p, calcMode) * calcQty[pid]; kinds++; }
  });
  document.getElementById('calcTotalSum').textContent = fmt(sum) + " so'm";
  /* "Chek chiqarish" tugmasi faqat mahsulot tanlanganda ko'rinadi */
  const btn = document.getElementById('calcReceiptBtn');
  if(btn) btn.classList.toggle('hidden', kinds===0);
}

function openCalcReceipt(){
  const items = Object.keys(calcQty).map(pid=>{
    const p = state.products.find(x=>x.id===pid);
    if(!p || !calcQty[pid]) return null;
    return { name:p.name, price:priceOf(p, calcMode), qty:calcQty[pid], amount:formatProductAmount(p) };
  }).filter(Boolean);

  if(!items.length){ alert("Avval mahsulot tanlang"); return; }

  const now = new Date();
  const dateTxt = now.toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  calcReceiptNo = 'HK-' + now.toISOString().slice(0,10).replace(/-/g,'') + '-' +
                  Math.random().toString(36).slice(2,6).toUpperCase();

  document.getElementById('crChekNo').textContent = '#' + calcReceiptNo;
  document.getElementById('crDate').textContent = dateTxt;
  document.getElementById('crKinds').textContent = items.length + ' ta';
  const crType = document.getElementById('crPriceType');
  if(crType) crType.textContent = (calcMode==='store') ? "Оптовая" : "Розничная";

  const crLogo = document.getElementById('crLogoImg');
  if(crLogo){ crLogo.src = getAppLogo(); crLogo.alt = "Unutilmas Ta'm"; }

  document.getElementById('crItemsList').innerHTML = items.map(i=>`
    <div class="rItemRow">
      <div>
        <div class="riName">${i.name}${i.amount ? ` <span class="riAmount">${i.amount}</span>` : ''}</div>
        <div class="riQty">${fmt(i.price)} so'm &times; ${i.qty}</div>
      </div>
      <div class="riPrice">${fmt(i.price*i.qty)} so'm</div>
    </div>
  `).join('');

  const total = items.reduce((s,i)=>s+i.price*i.qty,0);
  const totalQty = items.reduce((s,i)=>s+i.qty,0);
  document.getElementById('crSumsList').innerHTML =
    `<div class="rSumRow"><span>Видов товара</span><span>${items.length}</span></div>` +
    `<div class="rSumRow"><span>Всего штук</span><span>${totalQty}</span></div>`;
  document.getElementById('crTotalAmt').textContent = fmt(total) + " so'm";

  openModal('modalCalcReceipt');
}

async function downloadCalcReceiptImage(btn){
  /* Printerga chiqadigan chek bilan BIR XIL ko'rinish uchun xuddi shu
     rasmga-olish funksiyasidan foydalanamiz (16-rasterprint.js). */
  if(typeof captureReceipt !== 'function'){ alert("Rasm yaratish vositasi hali yuklanmagan. Bir marta internetli holatda ilovani oching — shundan keyin internetsiz ham ishlaydi."); return; }
  setDlBtnLoading(btn, true, 'Tayyorlanmoqda...');
  try{
    const canvas = await captureReceipt('calcReceiptCapture');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if(!blob) throw new Error('Rasm yaratilmadi');
    await triggerFileSave(blob, 'hisob-kitob.png', 'image/png');
  }catch(e){
    alert("Rasm yaratishda xato: " + (e.message||e));
  }finally{
    setDlBtnLoading(btn, false);
  }
}

async function downloadCalcReceiptPdf(btn){
  if(typeof captureReceipt !== 'function' || typeof window.jspdf === 'undefined'){
    alert("PDF yaratish vositasi hali yuklanmagan. Bir marta internetli holatda ilovani oching — shundan keyin internetsiz ham ishlaydi.");
    return;
  }
  setDlBtnLoading(btn, true, 'Tayyorlanmoqda...');
  try{
    const canvas = await captureReceipt('calcReceiptCapture');
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pxToMm = px => px * 0.264583;
    const pdfW = pxToMm(canvas.width);
    const pdfH = pxToMm(canvas.height);
    const pdf = new jsPDF({ orientation: pdfH >= pdfW ? 'portrait' : 'landscape', unit: 'mm', format: [pdfW, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    const blob = pdf.output('blob');
    await triggerFileSave(blob, 'hisob-kitob.pdf', 'application/pdf');
  }catch(e){
    alert("PDF yaratishda xato: " + (e.message||e));
  }finally{
    setDlBtnLoading(btn, false);
  }
}

function calcChangeQty(pid, d){
  const next = (calcQty[pid]||0) + d;
  if(next<=0) delete calcQty[pid]; else calcQty[pid]=next;
  renderCalculator();
}

function calcQtyInput(pid, el){
  const n = parseInt(el.value.replace(/[^0-9]/g,''),10);
  if(!isNaN(n) && n>0){ calcQty[pid]=n; updateCalcTotal(); }
}

function calcQtyBlur(pid, el){
  let n = parseInt(el.value.replace(/[^0-9]/g,''),10);
  if(isNaN(n)||n<1){ delete calcQty[pid]; renderCalculator(); return; }
  calcQty[pid]=n; el.value=n; updateCalcTotal();
}

function resetCalculator(){ calcQty = {}; renderCalculator(); }

function openImageViewer(src){
  document.getElementById('imgViewerSrc').src = src;
  document.getElementById('imgViewerBg').classList.add('open');
}

function closeImageViewer(){
  document.getElementById('imgViewerBg').classList.remove('open');
}

/* ---- Chatda rasm yuborish ---- */
function sendChatImage(inputEl){
  const file = inputEl.files[0];
  if(!file || !activeChatUserId) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = async ()=>{
      const maxSize = 480;
      let w = img.width, h = img.height;
      if(w>h){ if(w>maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
      else { if(h>maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
      // Rasmni endi state ichiga base64 qilib emas — serverga yuklab,
      // faqat URL'ini saqlaymiz (xotirani to'ldirmaslik uchun).
      const imageUrl = await uploadDataUrlToHost(dataUrl, 'chat-images');
      if(!imageUrl) return; // yuklanmadi — foydalanuvchiga xabar allaqachon ko'rsatildi
      const isAdmin = currentUser && currentUser.role==='admin';
      const chat = getOrCreateChat(activeChatUserId, isAdmin ? (state.chats.find(x=>x.userId===activeChatUserId)||{}).userName : currentUser.name);
      chat.messages.push({from: isAdmin?'admin':'user', image: imageUrl, time: new Date().toISOString()});
      if(isAdmin){ chat.unreadUser = true; } else { chat.unreadAdmin = true; }
      await saveState();
      renderChatThread();
      if(isAdmin){ pushNotification(activeChatUserId, 'Ishlab chiqaruvchidan rasm', '📷 Rasm yuborildi', 'chat', {type:'chat', id:activeChatUserId}); }
      else { pushNotification('admin', `${currentUser.name} rasm yubordi`, '📷 Rasm', 'chat', {type:'chat', id:currentUser.id}); try{ renderChatList(); }catch(e){} }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  inputEl.value = '';
}
