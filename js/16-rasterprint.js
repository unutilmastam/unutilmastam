/* Unutilmas Ta'm — 16-rasterprint.js
   ═══════════════════════════════════════════════════════════════
   CHEKNI RASM QILIB PRINTERGA YUBORISH

   Nima uchun: arzon termal printerlarning ko'pi matn rejimini
   (ESC/POS text) to'liq qo'llab-quvvatlamaydi — natijada oq qog'oz
   chiqadi. Rasm rejimi (GS v 0) esa deyarli hammasida ishlaydi.

   Ustiga rasm rejimida shrift o'lchamini xohlagancha kattalashtirish
   va logo qo'yish mumkin.

   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang.
   ═══════════════════════════════════════════════════════════════ */

const PRN_WIDTH = 384;          // 58mm qog'oz = 384 nuqta (203 dpi)

/* Chek sarlavhasidagi doimiy ma'lumotlar */
const RECEIPT_HEADER = {
  agent: 'Агент Шохрух',
  phone: '+998 90 519 99 67',
  title: 'прайслист',
  brand: 'УНУТИЛМАСТАМ'
};

let lastShopName = '';          // oxirgi yozilgan magazin nomi

/* ───────── Chekni rasmga olish ─────────

   MUHIM: chek oynasi YOPIQ bo'lsa ham ishlaydi.
   Yashirin elementni rasmga olib bo'lmaydi, shuning uchun chekning
   NUSXASI ekran tashqarisiga qo'yiladi va o'sha rasmga olinadi.
   Shu sabab chek oynasini istalgan vaqtda yopish mumkin. */
async function captureReceipt(captureId){
  const node = document.getElementById(captureId);
  if(!node) throw new Error('Chek topilmadi');
  if(typeof html2canvas !== 'function')
    throw new Error('Chop etish kutubxonasi yuklanmagan');

  /* Nusxani ekran tashqarisiga joylaymiz — ko'rinmaydi, lekin
     brauzer uni chizadi (display:none EMAS) */
  const holder = document.createElement('div');
  holder.className = 'printClone';
  /* Kenglik 400 -> 360: rasm 384 nuqtaga cho'zilganda harflar
     yana biroz kattalashadi (CSS dagi o'lchamlar ustiga qo'shimcha). */
  holder.style.cssText =
    'position:fixed;left:-10000px;top:0;width:360px;background:#fff;z-index:-1;';
  const clone = node.cloneNode(true);
  clone.removeAttribute('id');
  holder.appendChild(clone);
  document.body.appendChild(holder);
  document.body.classList.add('printCapture');

  let src;
  try{
    /* Nusxadagi barcha rasmlar yuklanguncha kutamiz —
       aks holda logo chekka tushmay qoladi */
    await waitForImages(holder, 2500);
    await new Promise(r => setTimeout(r, 80));
    src = await html2canvas(holder, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
      width: 360,
      windowWidth: 360
    });
  } finally {
    document.body.classList.remove('printCapture');
    holder.remove();
  }

  /* 58mm qog'oz kengligiga moslaymiz */
  const W = PRN_WIDTH;
  const H = Math.round(src.height * W / src.width);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + 40;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(src, 0, 0, W, H);
  return cv;
}

/* ───────── Canvas -> ESC/POS raster (GS v 0) ───────── */
function canvasToRaster(cv){
  const W = cv.width, H = cv.height;
  const g = cv.getContext('2d');
  const px = g.getImageData(0, 0, W, H).data;
  const bytesPerRow = Math.ceil(W / 8);

  /* 1-bitli tasvir: och rang -> 0, to'q rang -> 1 */
  const bits = new Uint8Array(bytesPerRow * H);
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const i = (y * W + x) * 4;
      const lum = (px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114);
      const alpha = px[i+3];
      if(alpha > 40 && lum < 170){
        bits[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }

  /* Printer buferi kichik — bandni kichik qilamiz, aks holda
     chek yarmida to'xtab qoladi. */
  const BAND = 24;
  const out = [];
  out.push(0x1B, 0x40);          // reset
  out.push(0x1B, 0x61, 0x01);    // markazga

  for(let y0 = 0; y0 < H; y0 += BAND){
    const rows = Math.min(BAND, H - y0);
    out.push(0x1D, 0x76, 0x30, 0x00,
             bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
             rows & 0xFF, (rows >> 8) & 0xFF);
    const start = y0 * bytesPerRow;
    for(let k = 0; k < rows * bytesPerRow; k++) out.push(bits[start + k]);
  }

  out.push(0x0A, 0x0A, 0x0A);
  out.push(0x1D, 0x56, 0x42, 0x00);   // kesish
  return new Uint8Array(out);
}

/* ───────── Magazin nomini so'rash va chiqarish ───────── */
function askShopAndPrint(captureId){
  const inp = document.getElementById('prnShopName');
  if(inp) inp.value = lastShopName || '';
  window.__prnCapture = captureId;

  /* Chek oynasini SHU ZAHOTI yopamiz.
     Rasm nusxadan olinadi, shuning uchun chek ochiq turishi shart emas. */
  ['modalCalcReceipt', 'modalReceipt'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
  });

  /* Har safar toza boshlanadi */
  try{
    if(typeof pickedStoreId !== 'undefined') pickedStoreId = '';
    const note = document.getElementById('prnDebtNote');
    if(note) note.classList.add('hidden');
    const sg = document.getElementById('shopSuggest');
    if(sg){ sg.classList.add('hidden'); sg.innerHTML = ''; }
    if(typeof setupPaymentBox === 'function') setupPaymentBox(captureId);
  }catch(e){ console.warn(e); }

  openModal('modalPrintShop');
  /* Imzo maydonini tayyorlaymiz (oyna ko'ringandan keyin o'lchov to'g'ri bo'ladi) */
  setTimeout(function(){
    try{ initSignaturePad(); }catch(e){ console.warn('Imzo:', e); }
    try{ inp && inp.focus(); }catch(e){}
  }, 320);
}

async function doPrintWithShop(){
  const inp = document.getElementById('prnShopName');
  lastShopName = inp ? inp.value.trim() : '';
  closeModal('modalPrintShop');

  /* Logo chekda turganiga ishonch hosil qilamiz */
  ensureReceiptLogo();

  /* To'lov va qarz */
  try{
    if(typeof currentPaid === 'function'){
      const paid = currentPaid();
      const debt = Math.max(0, prnTotal - paid);
      applyPaymentToReceipt(paid, debt);
      /* Sotuv, chek va qarz AYNAN tanlangan magazinga yoziladi */
      if(typeof finalizeStoreSale === 'function') finalizeStoreSale(pickedStoreId, prnTotal, paid, debt);
      else if(debt > 0 && pickedStoreId) recordStoreDebt(pickedStoreId, prnTotal, paid, debt);
    }
  }catch(e){ console.warn("To'lov:", e); }

  /* Magazin nomi va imzoni CHEKKA joylaymiz */
  applyShopName(lastShopName);
  lastSignature = getSignatureImage();
  applySignature(lastSignature);

  const captureId = window.__prnCapture || 'calcReceiptCapture';
  /* Rasm olinishi uchun chek hali ochiq turishi kerak,
     shuning uchun avval olamiz, keyin yopamiz. */
  setTimeout(function(){ rasterPrint(captureId, lastShopName); }, 150);
}

/* Magazin nomini chekdagi chiziq ustiga yozadi */
function applyShopName(name){
  ['crShopName', 'rShopName'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent = name || '';
  });
}

/* ───────── Asosiy: rasm sifatida chiqarish ─────────

   TARTIB MUHIM:
     1) chek KO'RINIB turganda rasmga olinadi
     2) chek oynasi DARHOL yopiladi
     3) shundan keyingina printerga ulanamiz

   Ilgari ulanishdan keyin yopilardi — foydalanuvchi "Bekor" bossa
   yoki printer ulanmasa, oyna ochiq qolib ketardi. */
async function rasterPrint(captureId, shopName){

  /* ── 1-qadam: rasmga olish (chek hali ko'rinib turibdi) ── */
  let cv = null;
  try{
    cv = await captureReceipt(captureId);
  }catch(e){
    console.warn('Chekni rasmga olib bo\'lmadi:', e);
  }

  if(!cv){
    alert("Chekni rasmga olib bo'lmadi. Qaytadan urinib ko'ring.");
    return;
  }

  /* ── 3-qadam: printerga ulanish va yuborish ── */
  if(!(navigator.bluetooth && navigator.bluetooth.requestDevice)){
    alert("Bu qurilma Bluetooth printerni qo'llab-quvvatlamaydi.\n\n" +
          "iPhone/iPad'da «Bluefy» brauzerida oching.");
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

    showPrintProgress(0);
    const bytes = canvasToRaster(cv);
    await sendToPrinter(ch, bytes, function(p){ showPrintProgress(p); });
    hidePrintProgress();

  }catch(e){
    hidePrintProgress();
    if(e && e.name === 'NotFoundError') return;   // foydalanuvchi bekor qildi
    console.warn('Raster print:', e);
    alert("Printerga yuborib bo'lmadi.\n\n" + (e && e.message ? e.message : ''));
  }
}

/* ── Yuborish jarayoni ko'rsatkichi ── */
function showPrintProgress(p){
  let el = document.getElementById('printProgress');
  if(!el){
    el = document.createElement('div');
    el.id = 'printProgress';
    el.innerHTML = '<div class="ppCard">' +
      '<div class="ppTitle">Печать чека…</div>' +
      '<div class="ppBar"><i></i></div>' +
      '<div class="ppPct">0%</div></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  const pct = Math.round(Math.min(1, Math.max(0, p)) * 100);
  const bar = el.querySelector('.ppBar i');
  const txt = el.querySelector('.ppPct');
  if(bar) bar.style.width = pct + '%';
  if(txt) txt.textContent = pct + '%';
}

function hidePrintProgress(){
  const el = document.getElementById('printProgress');
  if(!el) return;
  const bar = el.querySelector('.ppBar i');
  const txt = el.querySelector('.ppPct');
  if(bar) bar.style.width = '100%';
  if(txt) txt.textContent = 'Готово';
  setTimeout(function(){ el.classList.add('hidden'); }, 700);
}

/* Sinov: rasm rejimida */
async function testPrinterRaster(){
  if(!(navigator.bluetooth && navigator.bluetooth.requestDevice)){
    alert("Bu qurilma Bluetooth printerni qo'llab-quvvatlamaydi.\n\n" +
          "iPhone/iPad'da «Bluefy» brauzerida oching.");
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

    const W = PRN_WIDTH;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = 260;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, 260);
    g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.font = 'bold 34px sans-serif'; g.fillText('ТЕСТ', W/2, 10);
    g.font = 'bold 28px sans-serif'; g.fillText("UNUTILMAS TA'M", W/2, 56);
    g.font = '24px sans-serif';      g.fillText(RECEIPT_HEADER.phone, W/2, 96);
    g.font = '22px sans-serif';      g.fillText(new Date().toLocaleString('ru-RU'), W/2, 132);
    g.font = 'bold 24px sans-serif'; g.fillText('Принтер работает!', W/2, 172);
    g.font = '20px sans-serif';      g.fillText(btPrinter.name || '-', W/2, 210);

    showPrintProgress(0);
    await sendToPrinter(ch, canvasToRaster(cv), function(p){ showPrintProgress(p); });
    hidePrintProgress();
    alert('Тестовый чек отправлен.\n\nПринтер: ' + (btPrinter.name || '-'));
  }catch(e){
    if(e && e.name === 'NotFoundError') return;
    alert("Ulanib bo'lmadi.\n\n" + (e && e.message ? e.message : ''));
  }
}


/* ═══════════════════════════════════════════════════════════════
   ELEKTRON IMZO
   Magazin nomi oynasida barmoq bilan imzo qo'yiladi va u chekdagi
   "Магазин ____" qatoridan keyin joylashadi.
   ═══════════════════════════════════════════════════════════════ */
let signCtx = null;
let signDrawn = false;
let lastSignature = '';       // oxirgi imzo (data URL)

function initSignaturePad(){
  const cv = document.getElementById('prnSignPad');
  if(!cv) return;

  /* O'lchamni ekran zichligiga moslaymiz — chiziq aniq bo'lsin */
  const rect = cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(240, Math.round(rect.width));
  const h = Math.max(100, Math.round(rect.height));
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#111';
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  signCtx = g;
  signDrawn = false;

  const hint = document.getElementById('prnSignHint');
  if(hint) hint.classList.remove('hidden');

  if(cv.__signOn) return;      // hodisalar bir marta ulanadi
  cv.__signOn = true;

  let drawing = false;

  function pos(e){
    const r = cv.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function start(e){
    e.preventDefault();
    drawing = true;
    const p = pos(e);
    signCtx.beginPath();
    signCtx.moveTo(p.x, p.y);
    /* bir nuqta ham ko'rinsin */
    signCtx.lineTo(p.x + 0.1, p.y + 0.1);
    signCtx.stroke();
    if(!signDrawn){
      signDrawn = true;
      const h2 = document.getElementById('prnSignHint');
      if(h2) h2.classList.add('hidden');
    }
  }
  function move(e){
    if(!drawing) return;
    e.preventDefault();
    const p = pos(e);
    signCtx.lineTo(p.x, p.y);
    signCtx.stroke();
  }
  function end(){ drawing = false; }

  cv.addEventListener('touchstart', start, {passive:false});
  cv.addEventListener('touchmove',  move,  {passive:false});
  cv.addEventListener('touchend',   end);
  cv.addEventListener('mousedown',  start);
  cv.addEventListener('mousemove',  move);
  window.addEventListener('mouseup', end);
}

function clearSignature(){
  const cv = document.getElementById('prnSignPad');
  if(!cv || !signCtx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  signCtx.fillStyle = '#fff';
  signCtx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  signDrawn = false;
  const hint = document.getElementById('prnSignHint');
  if(hint) hint.classList.remove('hidden');
}

/* Imzoni kesib olib, faqat chizilgan qismini qaytaradi */
function getSignatureImage(){
  const cv = document.getElementById('prnSignPad');
  if(!cv || !signDrawn) return '';

  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const d = g.getImageData(0, 0, W, H).data;

  /* chizilgan chegaralarni topamiz */
  let minX = W, minY = H, maxX = 0, maxY = 0, found = false;
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const i = (y * W + x) * 4;
      if(d[i] < 170){                 // qora chiziq
        found = true;
        if(x < minX) minX = x;
        if(x > maxX) maxX = x;
        if(y < minY) minY = y;
        if(y > maxY) maxY = y;
      }
    }
  }
  if(!found) return '';

  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  const og = out.getContext('2d');
  og.fillStyle = '#fff';
  og.fillRect(0, 0, out.width, out.height);
  og.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/* Imzoni chekka joylaydi */
function applySignature(dataUrl){
  ['crSignImg', 'rSignImg'].forEach(function(id){
    const im = document.getElementById(id);
    if(!im) return;
    if(dataUrl){ im.src = dataUrl; im.classList.remove('hidden'); }
    else { im.removeAttribute('src'); im.classList.add('hidden'); }
  });
}


/* Chekdagi logoni ta'minlaydi */
function ensureReceiptLogo(){
  ['crLogoImg', 'receiptLogoImg'].forEach(function(id){
    const im = document.getElementById(id);
    if(!im) return;
    if(!im.getAttribute('src')){
      try{ im.src = getAppLogo(); }catch(e){}
    }
    im.alt = "Unutilmas Ta'm";
  });
}

/* Berilgan element ichidagi rasmlar yuklanguncha kutadi */
function waitForImages(root, timeoutMs){
  const imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
  if(!imgs.length) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map(function(im){
      if(im.complete && im.naturalWidth > 0) return Promise.resolve();
      return new Promise(function(res){
        im.addEventListener('load', res, {once:true});
        im.addEventListener('error', res, {once:true});
      });
    })),
    new Promise(function(res){ setTimeout(res, timeoutMs || 2500); })
  ]);
}
