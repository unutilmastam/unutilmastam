/* Unutilmas Ta'm — 3-auth
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function saveSession(){
  try{
    if(currentUser) localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(SESSION_KEY);
  }catch(e){}
}

function restoreSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(s && s.role === 'admin'){ currentUser = s; return; }
    if(s && s.role === 'user'){
      const u = state.users.find(x=>x.id===s.id);
      if(u && !u.blocked){
        currentUser = {role:'user', id:u.id, name:u.name, contact:u.contact, userType: u.userType||'customer'};
  saveSession();
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }catch(e){}
}

/* ---- Parollarni xesh qilib saqlash (ochiq matnda saqlanmaydi) ---- */
/* ═══ ADMIN KODINI XESHLASH ═══
   Ilgari admin kodi OCHIQ MATNDA saqlanardi va u har bir foydalanuvchiga
   yuklanardigan hujjat ichida edi — ya'ni istalgan mijoz uni o'qib,
   admin bo'lib kira olardi. Endi faqat xeshi saqlanadi.
   Eski ochiq kodlar birinchi muvaffaqiyatli kirishda avtomatik xeshga o'tadi. */
async function hashAdminCode(c){
  try{
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('utam-admin:' + c));
    return 'a1:' + Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){ return c; }
}

/* Kiritilgan kod to'g'rimi? Eski (xeshlanmagan) formatni ham qabul qiladi. */
async function adminCodeMatches(entered){
  const stored = state.adminSettings && state.adminSettings.code;
  if(stored == null || stored === '') return false;
  if(String(stored).startsWith('a1:')){
    return (await hashAdminCode(entered)) === stored;
  }
  /* eski ochiq matn — solishtiramiz va darhol xeshga o'tkazamiz */
  if(entered === stored){
    try{
      state.adminSettings.code = await hashAdminCode(entered);
      await saveState();
    }catch(e){}
    return true;
  }
  return false;
}

async function hashPass(p){
  try{
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('utam:' + p));
    return 'h1:' + Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){ return p; } // juda eski brauzer: ochiq holda
}

async function passMatches(user, entered){
  if(!user || user.password==null) return false;
  if(String(user.password).startsWith('h1:')){
    return (await hashPass(entered)) === user.password;
  }
  // eski (ochiq) parol: mos kelsa darhol xeshga o'tkazamiz
  if(user.password === entered){
    user.password = await hashPass(entered);
    await saveState();
    return true;
  }
  return false;
}

function previewAuthPhoto(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const maxSize = 220;
      let w = img.width, h = img.height;
      if(w>h){ if(w>maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
      else { if(h>maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      pendingAuthPhoto = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('authPhotoPreview').innerHTML = `<img src="${pendingAuthPhoto}">`;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function setAuthMode(mode){
  authMode = mode;
  const tl = document.getElementById('authTabLogin');
  const tr = document.getElementById('authTabRegister');
  if(tl) tl.classList.toggle('active', mode==='login');
  if(tr) tr.classList.toggle('active', mode==='register');
  document.getElementById('authRegisterFields').classList.toggle('hidden', mode!=='register');
  document.getElementById('authForgotLink').classList.toggle('hidden', mode!=='login');
  document.getElementById('authTitle').textContent = mode==='login' ? 'Kirish' : 'Ro\'yxatdan o\'tish';
  document.getElementById('authSubmitBtn').textContent = mode==='login' ? 'Kirish' : 'Ro\'yxatdan o\'tish';
  document.getElementById('authErr').classList.add('hidden');
  /* Ro'yxatdan o'tishda tugma o'rtada tursin (yonida boshqa tugma yo'q) */
  const row = document.getElementById('authSubmitBtn').parentElement;
  if(row) row.style.justifyContent = 'center';
  /* "Hisobingiz yo'qmi?" havolasi faqat KIRISH rejimida ko'rinadi */
  const regLink = document.getElementById('authRegisterLink');
  if(regLink) regLink.classList.toggle('hidden', mode !== 'login');
  /* setRegType TANLOV oynasida chaqiriladi — bu yerda qayta o'rnatmaymiz */
  pendingAuthPhoto = null;
  const photoBox = document.getElementById('authPhotoPreview');
  if(photoBox) photoBox.innerHTML = ic('user',22);
  const photoInput = document.getElementById('authPhotoInput');
  if(photoInput) photoInput.value = '';
}

/* ============================================================
   ADMIN SIFATIDA KIRISH — alohida oyna + kirish animatsiyasi
   ============================================================ */
function toggleAdminPane(){ openAdminLogin(); }

function openAdminLogin(){
  closeModal('modalAuth');
  const inp = document.getElementById('adminCodeInput');
  const err = document.getElementById('adminLoginErr');
  if(inp) inp.value = '';
  if(err) err.classList.add('hidden');
  setTimeout(()=>{
    openModal('modalAdminLogin');
    setTimeout(()=>{ try{ inp && inp.focus(); }catch(e){} }, 260);
  }, 150);
}

function closeAdminLogin(){
  closeModal('modalAdminLogin');
  setTimeout(()=>openModal('modalAuth'), 150);
}

async function adminLoginSubmit(){
  const inp  = document.getElementById('adminCodeInput');
  const err  = document.getElementById('adminLoginErr');
  const card = inp ? inp.closest('.modalCard') : null;
  const code = (inp ? inp.value : '').trim();

  if(!code){
    err.textContent = "Parolni kiriting.";
    err.classList.remove('hidden');
    if(card){ card.classList.remove('adminShake'); void card.offsetWidth; card.classList.add('adminShake'); }
    return;
  }
  if(!(await adminCodeMatches(code))){
    err.textContent = "Parol noto'g'ri. Qaytadan urinib ko'ring.";
    err.classList.remove('hidden');
    inp.value = '';
    if(card){ card.classList.remove('adminShake'); void card.offsetWidth; card.classList.add('adminShake'); }
    try{ if(navigator.vibrate) navigator.vibrate([30,60,30]); }catch(e){}
    return;
  }

  // ✅ To'g'ri parol — animatsiya bilan ilovaga kiramiz
  err.classList.add('hidden');
  closeModal('modalAdminLogin');
  playAdminEnterAnimation(()=>{
    currentUser = {role:'admin', id:'admin', name:'Siz', contact:''};
    saveSession();
    refreshShell();
    ensureNotifPermission();
    showView('dash');
  });
}

function playAdminEnterAnimation(done){
  const old = document.getElementById('adminEnterFx');
  if(old) old.remove();
  const fx = document.createElement('div');
  fx.id = 'adminEnterFx';
  fx.innerHTML =
    '<div class="adminFxRing">' +
      '<div class="adminFxCheck">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
      '</div>' +
    '</div>' +
    '<div class="adminFxTitle">Xush kelibsiz, Administrator</div>' +
    '<div class="adminFxSub">Boshqaruv paneli tayyorlanmoqda…</div>' +
    '<div class="adminFxBar"><i></i></div>';
  document.body.appendChild(fx);
  try{ if(navigator.vibrate) navigator.vibrate(18); }catch(e){}
  setTimeout(()=>{ try{ done && done(); }catch(e){ console.warn(e); } }, 1150);
  setTimeout(()=>{ fx.classList.add('out'); }, 1400);
  setTimeout(()=>{ if(fx.parentNode) fx.remove(); }, 1950);
}

 // {contact, isAdmin, code, tgToken, verified}

function prShowErr(t){
  const e = document.getElementById('forgotErr');
  document.getElementById('forgotOk').classList.add('hidden');
  e.textContent = t; e.classList.remove('hidden');
}

function prShowOk(t){
  const o = document.getElementById('forgotOk');
  document.getElementById('forgotErr').classList.add('hidden');
  o.textContent = t; o.classList.remove('hidden');
}

function prClearMsg(){
  document.getElementById('forgotErr').classList.add('hidden');
  document.getElementById('forgotOk').classList.add('hidden');
}

function prGoPhase(n){
  [1,2,3].forEach(i=>{
    const el = document.getElementById('prPhase'+i);
    if(!el) return;
    el.classList.toggle('hidden', i!==n);
    if(i===n){ el.classList.remove('prPhaseIn'); void el.offsetWidth; el.classList.add('prPhaseIn'); }
    const dot = document.getElementById('prStepDot'+i);
    if(dot){ dot.classList.toggle('active', i===n); dot.classList.toggle('done', i<n); }
  });
  const l1 = document.getElementById('prStepLine1'), l2 = document.getElementById('prStepLine2');
  if(l1) l1.classList.toggle('done', n>1);
  if(l2) l2.classList.toggle('done', n>2);
}

/* ---- 1-BOSQICH: raqamni tekshirib, tasdiqlash kodini so'rash ---- */
function prRequestCode(){
  prClearMsg();
  const contact = document.getElementById('forgotContact').value.trim();
  if(!contact){ prShowErr('Telefon raqam yoki emailingizni kiriting.'); return; }

  const as = state.adminSettings;
  const isAdmin = !!(as && (contact===as.phone || contact===as.email));
  const u = state.users.find(x=>x.contact===contact);

  if(!isAdmin && !u){
    prShowErr("Bu telefon raqam yoki email bilan ro'yxatdan o'tgan foydalanuvchi topilmadi.");
    return;
  }

  pendingReset = { contact, isAdmin, verified:false, code: generateOtpCode() };
  document.getElementById('prTarget').textContent = contact;
  document.getElementById('prCode').value = '';

  if(tgVerifyOn()){
    // Bot deep-link uchun bir martalik token (ichiga raqam ham yashirin qo'shiladi —
    // bot Telegramdagi raqam bilan solishtiradi, mos kelmasa kod bermaydi)
    const digits = contact.replace(/[^0-9]/g,'');
    pendingReset.tgToken = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,10) + '_' + digits;
    document.getElementById('prTgBtn').href = 'https://t.me/' + TG_VERIFY.bot + '?start=' + pendingReset.tgToken;
    document.getElementById('prTgWrap').classList.remove('hidden');
    document.getElementById('prDemoWrap').classList.add('hidden');
  } else {
    document.getElementById('prDemoCode').textContent = pendingReset.code;
    document.getElementById('prTgWrap').classList.add('hidden');
    document.getElementById('prDemoWrap').classList.remove('hidden');
  }
  prGoPhase(2);
}

function prResendCode(){
  if(!pendingReset){ prShowErr('Avval raqamingizni kiriting.'); return; }
  prClearMsg();
  if(tgVerifyOn()){
    alert("Telegram botdagi «♻️ Yangi kod olish» tugmasini bosing yoki yuqoridagi ko'k tugma orqali botga qayta kiring.");
    return;
  }
  pendingReset.code = generateOtpCode();
  document.getElementById('prDemoCode').textContent = pendingReset.code;
}

/* ---- 2-BOSQICH: kodni tekshirish ---- */
async function prConfirmCode(){
  if(!pendingReset){ prShowErr('Avval raqamingizni kiriting.'); prGoPhase(1); return; }
  prClearMsg();
  const entered = document.getElementById('prCode').value.trim();
  if(!entered){ prShowErr('Kodni kiriting.'); return; }

  const btn = document.getElementById('prVerifyBtn');

  if(tgVerifyOn()){
    btn.disabled = true; btn.style.opacity = '.6';
    try{
      const res = await fetch(TG_VERIFY.api.replace(/\/$/,'') + '/verify', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: pendingReset.tgToken, code: entered })
      });
      const d = await res.json();
      if(!d.ok){
        const msgs = {
          not_found:"Sessiya topilmadi. «Telegram orqali kod olish» tugmasini bosib, botda raqamingizni yuboring.",
          expired:"Kod eskirgan. Botdagi «♻️ Yangi kod olish» tugmasini bosing.",
          too_many:"Urinishlar ko'payib ketdi. Botdan yangi kod oling.",
          wrong_code:"Kod noto'g'ri. Qaytadan urinib ko'ring."
        };
        prShowErr(msgs[d.error] || "Xatolik yuz berdi. Qaytadan urinib ko'ring.");
        return;
      }
      // Telegramdagi raqam ilovada kiritilgan raqamga mos kelishi shart
      const tgDigits   = String(d.phone||'').replace(/\D/g,'');
      const formDigits = (pendingReset.contact||'').replace(/\D/g,'');
      if(formDigits.length>=9 && tgDigits && !tgDigits.endsWith(formDigits.slice(-9))){
        prShowErr("Telegramdagi raqamingiz (" + d.phone + ") kiritilgan raqamga mos emas.");
        return;
      }
    }catch(e){
      prShowErr("Server bilan aloqa yo'q. Internetni tekshirib qayta urinib ko'ring.");
      return;
    }finally{
      btn.disabled = false; btn.style.opacity = '';
    }
  } else {
    if(entered !== pendingReset.code){ prShowErr("Kod noto'g'ri. Qaytadan urinib ko'ring."); return; }
  }

  pendingReset.verified = true;
  try{ if(navigator.vibrate) navigator.vibrate(16); }catch(e){}
  prGoPhase(3);
  setTimeout(()=>{ try{ document.getElementById('forgotNewPass').focus(); }catch(e){} }, 320);
}

/* ---- 3-BOSQICH: yangi parolni saqlash ---- */
async function prSaveNewPassword(){
  prClearMsg();
  if(!pendingReset || !pendingReset.verified){
    prShowErr("Avval raqamingizni tasdiqlashingiz kerak.");
    prGoPhase(1);
    return;
  }
  const p1 = document.getElementById('forgotNewPass').value;
  const p2 = document.getElementById('forgotNewPass2').value;
  if(!p1 || !p2){ prShowErr('Yangi parolni ikkala maydonga ham yozing.'); return; }
  if(p1.length < 4){ prShowErr("Parol kamida 4 ta belgidan iborat bo'lsin."); return; }
  if(p1 !== p2){ prShowErr('Parollar bir-biriga mos kelmadi.'); return; }

  if(pendingReset.isAdmin){
    state.adminSettings.code = await hashAdminCode(p1);
    await saveState();
    prShowOk('Admin paroli yangilandi. Endi yangi parol bilan kirishingiz mumkin.');
    pendingReset = null;
    setTimeout(()=>{ closeForgotFlow(); openAdminLogin(); }, 1400);
    return;
  }

  const u = state.users.find(x=>x.contact===pendingReset.contact);
  if(!u){ prShowErr('Foydalanuvchi topilmadi.'); return; }
  u.password = await hashPass(p1);
  await saveState();

  prShowOk('Parol muvaffaqiyatli yangilandi. Endi kirishingiz mumkin.');
  document.getElementById('authContact').value = pendingReset.contact;
  document.getElementById('authPassword').value = '';
  pendingReset = null;
  setTimeout(()=>{ closeForgotFlow(); }, 1400);
}

function tgVerifyOn(){ return !!(TG_VERIFY.bot && TG_VERIFY.api); }

/* Yangi buyurtma tushganda botga (faqat admin/bot egasiga) xabar yuboradi.
   Xato bo'lsa ham ilovaning ishlashiga xalaqit bermaydi — jim tarzda o'tkazib yuboriladi. */
async function notifyAdminViaBot(message){
  if(!TG_VERIFY.api) return;
  try{
    await fetch(TG_VERIFY.api.replace(/\/$/,'') + '/notify-admin', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({message})
    });
  }catch(e){
    console.warn('Botga xabar yuborishda xato (e\'tibor bermasa ham bo\'ladi):', e);
  }
}

function generateOtpCode(){ return String(Math.floor(100000 + Math.random()*900000)); }

async function submitAuth(){
  const contact = document.getElementById('authContact').value.trim();
  const password = document.getElementById('authPassword').value;
  const errBox = document.getElementById('authErr');
  errBox.classList.add('hidden');
  if(!contact || !password){ errBox.textContent='Barcha maydonlarni to\'ldiring.'; errBox.classList.remove('hidden'); return; }

  if(authMode==='register'){
    const name = document.getElementById('authName').value.trim();
    /* BITTA RAQAM — BITTA HISOB.
       Ilgari solishtirish AYNAN matn bo'yicha edi, shuning uchun
       "+998901112233", "+998 90 111 22 33" va "901112233" uchta
       boshqa-boshqa hisob ochib yuborardi. Endi raqamlar bir xil
       ko'rinishga keltirilib solishtiriladi (30-storelink.js). */
    const dup = (typeof findUserByContact === 'function')
      ? findUserByContact(contact)
      : state.users.find(u=>u.contact===contact);
    if(dup){
      errBox.textContent = (dup.userType === 'store')
        ? 'Bu raqam bilan magazin egasi allaqachon ro\'yxatdan o\'tgan. "Kirish" bo\'limidan foydalaning yoki administrator bilan bog\'laning.'
        : 'Bu raqam yoki email allaqachon ro\'yxatdan o\'tgan. "Kirish" bo\'limidan foydalaning.';
      errBox.classList.remove('hidden');
      return;
    }
    if(!name){ errBox.textContent='Ism va familyangizni kiriting.'; errBox.classList.remove('hidden'); return; }
    let storeName='', storeAddr='';
    if(regType==='store'){
      storeName = document.getElementById('authStoreName').value.trim();
      storeAddr = document.getElementById('authStoreAddr').value.trim();
      if(!storeName){ errBox.textContent='Magazin nomini kiriting.'; errBox.classList.remove('hidden'); return; }
      if(!storeAddr){ errBox.textContent='Shahar/manzilni kiriting.'; errBox.classList.remove('hidden'); return; }
    }
    /* Telegram Mini App orqali kelgan bo'lsa — hisob allaqachon
       Telegram tomonidan tasdiqlangan, kod so'ralmaydi. */
    if(OTP_VERIFICATION_ENABLED && !(typeof tgSkipsOtp === 'function' && tgSkipsOtp())){
      // Hisob hali yaratilmaydi — avval telefon/email tasdiqlanishi kerak
      pendingRegistration = {name, contact, password, regType, storeName, storeAddr, photo: pendingAuthPhoto, homeLat: regPickLat, homeLng: regPickLng, code: generateOtpCode()};
      openVerifyCodeModal();
      return;
    }
    // OTP o'chirilgan holatda hisob to'g'ridan-to'g'ri yaratiladi
    const ip = await fetchPublicIp();
    /* homeLat/homeLng — ro'yxatdan o'tishda xaritada belgilangan joy.
       Ilgari bu yo'l (OTP o'chirilgan holat) uni saqlamasdan tashlab
       yuborardi, shuning uchun do'kon kartasi keyin noto'g'ri joyga
       tushardi. */
    const u = {id:uid('u'), name, contact, password, createdAt: todayISO(), userType: regType, verified:false,
               homeLat: (typeof regPickLat==='number' ? regPickLat : null),
               homeLng: (typeof regPickLng==='number' ? regPickLng : null),
               photo: pendingAuthPhoto||null, ipAddress: ip};
    if(regType==='store') u.storeStatus = 'pending';   // admin tasdiqlashi kerak
    /* Telegram orqali kelgan bo'lsa hisobni unga bog'laymiz —
       keyingi safar avtomatik kiradi */
    if(typeof tgVerifiedUser !== 'undefined' && tgVerifiedUser){
      u.telegramId = tgVerifiedUser.id;
      u.telegramUsername = tgVerifiedUser.username || '';
      u.verified = true;
    }
    u.personalId = 'UT-' + u.id.split('_')[1].toUpperCase();
    if(regType==='store'){ u.storeName = storeName; u.address = storeAddr; }
    state.users.push(u);
    try{ if(typeof attachReferral === 'function') await attachReferral(u); }catch(e){ console.warn('Referal:', e); }
    await saveState();
    currentUser = {role:'user', id:u.id, name:u.name, contact:u.contact, userType: u.userType||'customer'};
  saveSession();
  sendWelcomeMessage(u.id, u.name);
  notifyNewStoreOwner(u);   // magazin egasi bo'lsa adminга xabar
  } else {
    const u = state.users.find(x=>x.contact===contact);
    if(!u || !(await passMatches(u, password))){
      errBox.textContent = 'Login yoki parol noto\'g\'ri.';
      errBox.classList.remove('hidden');
      return;
    }
    if(u.blocked){
      errBox.textContent = 'Sizning hisobingiz administratsiya tomonidan bloklangan.';
      errBox.classList.remove('hidden');
      return;
    }
    currentUser = {role:'user', id:u.id, name:u.name, contact:u.contact, userType: u.userType||'customer'};
  saveSession();
  }
  finishAuthSuccess();
}

function finishAuthSuccess(){
  document.getElementById('authContact').value='';
  document.getElementById('authPassword').value='';
  document.getElementById('authName').value='';
  document.getElementById('authStoreName').value='';
  document.getElementById('authStoreAddr').value='';
  pendingAuthPhoto = null;
  closeModal('modalAuth');
  refreshShell();
  ensureNotifPermission();
  const cb = pendingAfterAuth; pendingAfterAuth = null;
  if(cb) cb(); else showView('cabinet');
}

/* ---- Ro'yxatdan o'tishda telefon/email tasdiqlash kodi (OTP) ---- */
function openVerifyCodeModal(){
  document.getElementById('vcTarget').textContent = pendingRegistration.contact;
  document.getElementById('vcInput').value = '';
  document.getElementById('vcErr').classList.add('hidden');
  if(tgVerifyOn()){
    // Haqiqiy rejim: bot deep-link uchun bir martalik token
    // Token ichiga ilovaga kiritilgan raqamni ham (faqat raqamlar) yashirincha qo'shamiz —
    // shunda bot Telegram'dan kelgan raqam bilan solishtirib, mos kelmasa kodni bermaydi.
    const expectedPhoneDigits = (pendingRegistration.contact||'').replace(/[^0-9]/g,'');
    pendingRegistration.tgToken = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,10) + '_' + expectedPhoneDigits;
    document.getElementById('vcTgBtn').href = 'https://t.me/' + TG_VERIFY.bot + '?start=' + pendingRegistration.tgToken;
    document.getElementById('vcTgWrap').classList.remove('hidden');
    document.getElementById('vcDemoWrap').classList.add('hidden');
  } else {
    // DEMO rejim: kod ekranda ko'rsatiladi
    document.getElementById('vcDemoCode').textContent = pendingRegistration.code;
    document.getElementById('vcTgWrap').classList.add('hidden');
    document.getElementById('vcDemoWrap').classList.remove('hidden');
  }
  closeModal('modalAuth');
  openModal('modalVerifyCode');
}

function resendVerifyCode(){
  if(!pendingRegistration) return;
  document.getElementById('vcErr').classList.add('hidden');
  if(tgVerifyOn()){
    alert("Telegram botdagi «♻️ Yangi kod olish» tugmasini bosing yoki yuqoridagi ko'k tugma orqali botga qayta kiring.");
    return;
  }
  pendingRegistration.code = generateOtpCode();
  document.getElementById('vcDemoCode').textContent = pendingRegistration.code;
}

function cancelVerifyCode(){
  pendingRegistration = null;
  closeModal('modalVerifyCode');
  openModal('modalAuth');
}

async function confirmVerifyCode(){
  if(!pendingRegistration) return;
  const errEl = document.getElementById('vcErr');
  const showErr = t => { errEl.textContent = t; errEl.classList.remove('hidden'); };
  const entered = document.getElementById('vcInput').value.trim();
  if(!entered){ showErr('Kodni kiriting.'); return; }

  let tgPhone = null;
  if(tgVerifyOn()){
    const btn = document.getElementById('vcConfirmBtn');
    btn.disabled = true; btn.style.opacity='.6';
    try{
      const res = await fetch(TG_VERIFY.api.replace(/\/$/,'') + '/verify', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: pendingRegistration.tgToken, code: entered })
      });
      const d = await res.json();
      if(!d.ok){
        const msgs = { not_found:"Sessiya topilmadi. «Telegram orqali kod olish» tugmasini bosib, botda raqamingizni yuboring.", expired:"Kod eskirgan. Botdagi «♻️ Yangi kod olish» tugmasini bosing.", too_many:"Urinishlar ko'payib ketdi. Botdan yangi kod oling.", wrong_code:"Kod noto'g'ri. Qaytadan urinib ko'ring." };
        showErr(msgs[d.error] || 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
        return;
      }
      tgPhone = String(d.phone||'');
      // Formadagi telefon Telegram raqami bilan mos kelishini tekshirish
      const formDigits = (pendingRegistration.contact||'').replace(/\D/g,'');
      const tgDigits = tgPhone.replace(/\D/g,'');
      if(formDigits.length>=9 && tgDigits && !tgDigits.endsWith(formDigits.slice(-9))){
        showErr('Telegramdagi raqamingiz (' + tgPhone + ') formada kiritilgan raqamga mos emas. Formaga o\'z raqamingizni yozing.');
        return;
      }
    }catch(e){
      showErr('Server bilan aloqa yo\'q. Internetni tekshirib qayta urinib ko\'ring.');
      return;
    }finally{
      btn.disabled = false; btn.style.opacity='';
    }
  } else {
    if(entered !== pendingRegistration.code){ showErr('Kod noto\'g\'ri. Qaytadan urinib ko\'ring.'); return; }
  }
  const r = pendingRegistration;
  r.tgPhone = tgPhone;

  /* Oxirgi tekshiruv: kod kiritilayotgan paytda boshqa qurilmadan
     shu raqam bilan hisob ochilgan bo'lishi mumkin (yoki bulutdan
     yangi ma'lumot kelgan). Bitta raqam — bitta hisob. */
  const dupNow = (typeof findUserByContact === 'function') ? findUserByContact(r.contact) : null;
  if(dupNow){
    showErr(dupNow.userType === 'store'
      ? "Bu raqam bilan magazin egasi allaqachon ro'yxatdan o'tgan. \"Kirish\" bo'limidan foydalaning."
      : "Bu raqam allaqachon ro'yxatdan o'tgan. \"Kirish\" bo'limidan foydalaning.");
    return;
  }

  const ip = await fetchPublicIp();
  const u = {id:uid('u'), name:r.name, contact:r.contact, password: await hashPass(r.password), createdAt: todayISO(), userType: r.regType, storeStatus: (r.regType==='store' ? 'pending' : undefined), verified:true, tgVerified: !!r.tgPhone, tgPhone: r.tgPhone||null, homeLat: r.homeLat||null, homeLng: r.homeLng||null, photo:r.photo||null, ipAddress: ip};
  u.personalId = 'UT-' + u.id.split('_')[1].toUpperCase();
  if(r.regType==='store'){ u.storeName = r.storeName; u.address = r.storeAddr; }
  state.users.push(u);
  await saveState();
  currentUser = {role:'user', id:u.id, name:u.name, contact:u.contact, userType: u.userType||'customer'};
  saveSession();
  sendWelcomeMessage(u.id, u.name);
  notifyNewStoreOwner(u);   // magazin egasi bo'lsa adminга xabar
  pendingRegistration = null;
  closeModal('modalVerifyCode');
  finishAuthSuccess();
}

/* Eski chaqiruvlar bilan moslik uchun: endi admin kirishi alohida oynada */
function authAdminLogin(){ openAdminLogin(); }

function logout(){
  currentUser = null;
  saveSession();
  refreshShell();
  showView('catalog');
}

function openAuthModal(mode, afterCb){
  setAuthMode(mode||'login');
  pendingAfterAuth = afterCb||null;
  document.getElementById('authForgotPane').classList.add('hidden');
  document.getElementById('authMainFields').classList.remove('hidden');
  document.getElementById('authTitle').textContent = (mode==='register') ? "Ro'yxatdan o'tish" : 'Kirish';
  pendingReset = null;
  openModal('modalAuth');
}

function chooseRegisterType(type){
  closeModal('modalRegisterChoice');
  setTimeout(()=>{
    openAuthModal('register');
    setRegType(type);
    /* Telegram orqali kelgan bo'lsa ismni oldindan to'ldiramiz */
    try{ if(typeof applyTgPrefill === 'function') applyTgPrefill(); }catch(e){}
  }, 180);
}

function openAdminAccount(){
  const as = state.adminSettings;
  document.getElementById('aaPhone').value = as.phone||'';
  document.getElementById('aaEmail').value = as.email||'';
  document.getElementById('aaCurrentCode').value = '';
  document.getElementById('aaNewCode').value = '';
  document.getElementById('aaErr').classList.add('hidden');
  document.getElementById('aaOk').classList.add('hidden');
  openModal('modalAdminAccount');
}

async function saveAdminAccount(){
  const as = state.adminSettings;
  const errBox = document.getElementById('aaErr');
  const okBox = document.getElementById('aaOk');
  errBox.classList.add('hidden'); okBox.classList.add('hidden');
  const currentCode = document.getElementById('aaCurrentCode').value.trim();
  if(currentCode !== as.code){
    errBox.textContent = 'Joriy kod noto\'g\'ri kiritildi.';
    errBox.classList.remove('hidden');
    return;
  }
  as.phone = document.getElementById('aaPhone').value.trim();
  as.email = document.getElementById('aaEmail').value.trim();
  const newCode = document.getElementById('aaNewCode').value.trim();
  if(newCode){ as.code = newCode; }
  await saveState();
  okBox.classList.remove('hidden');
  document.getElementById('aaCurrentCode').value = '';
  document.getElementById('aaNewCode').value = '';
  setTimeout(()=>{ closeModal('modalAdminAccount'); }, 900);
}

/* Tanishish rejimida savat/buyurtma amallarini to'sadi.
   CSS tugmalarni yashiradi, bu esa ikkinchi himoya qatlami. */
function previewBlocked(){
  if(!previewMode) return false;
  alert("Hisobingiz tasdiqlanmaguncha buyurtma bera olmaysiz.\n\nAdministrator tasdiqlagach narxlar va savat ochiladi.");
  return true;
}

/* "Holatni tekshirish" — bulutdan yangi ma'lumot olib qaraydi */
async function recheckStoreApproval(){
  try{ if(typeof flushCloud === 'function') await flushCloud(); }catch(e){}
  await new Promise(r=>setTimeout(r, 700));
  if(!isPendingStore()){
    document.getElementById('storePendingScreen').classList.add('hidden');
    alert('Hisobingiz tasdiqlandi! Ilova qayta yuklanadi.');
    location.reload();
  }else{
    alert('Hali tasdiqlanmagan. Biroz kuting yoki administrator bilan bog\'laning.');
  }
}

function spContactAdmin(){
  const phone = (state.sellerInfo && state.sellerInfo.phone) || '';
  if(phone){ window.location.href = 'tel:' + phone.replace(/\s/g,''); return; }
  if(TG_VERIFY.bot){ window.open('https://t.me/' + TG_VERIFY.bot, '_blank'); return; }
  alert('Administrator bilan bog\'lanish uchun ma\'lumot topilmadi.');
}

/* ESLATMA: dedupeStoresByOwner() va backfillApprovedStoreOwners()
   endi js/30-storelink.js ichida — u yerda ular bulutdan ma'lumot
   kelgan HAR SAFAR qayta ishlaydi (ilgari ochilgandan keyin 3,2
   soniyada bir marta ishlab, bulut kech kelsa bo'sh ro'yxat ustida
   ishlab ketardi). */

/* ADMIN: magazin egasini tasdiqlash / rad etish */
async function approveStoreUser(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u) return;
  if(!confirm(`"${u.name}" magazin egasi sifatida tasdiqlansinmi?\n\nTasdiqlangach u magazin (ulgurji) narxlarini ko'ra boshlaydi.`)) return;
  u.storeStatus = 'approved';
  u.storeApprovedAt = nowTs();
  /* Do'kon kartasi odatda ro'yxatdan o'tgandayoq yaratilgan bo'ladi
     (30-storelink.js). Shunga qaramay bu yerda ham tekshiramiz —
     admin biror sababdan kartasiz egani tasdiqlasa, karta shu
     zahoti paydo bo'lsin. */
  try{ if(typeof ensureStoreForOwner === 'function') ensureStoreForOwner(u); }catch(e){ console.warn("Do'kon kartasi:", e); }
  await saveState();
  try{ const __v=document.getElementById("v-stores"); if(typeof renderStores==="function" && __v && __v.classList.contains("active")) renderStores(); }catch(e){}
  pushNotification(u.id, 'Hisobingiz tasdiqlandi',
    'Magazin egasi sifatida tasdiqlandingiz. Endi ilovadan to\'liq foydalanishingiz mumkin.', 'system');
  refreshPendingStoreBadge();
  openUsersModal();
}

function previewProductImage(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = async ()=>{
      // Rasm endi state/Firestore ichiga emas, serverga (uploads/)
      // saqlanadi — shuning uchun kichraytirib sifatni pasaytirish shart
      // emas. Faqat haddan tashqari katta (masalan 4000px+) rasmlarni
      // biroz cheklaymiz, sifat esa deyarli asl holicha qoladi.
      const maxSize = 2000;
      let w = img.width, h = img.height;
      if(w>h){ if(w>maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
      else { if(h>maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
      let dataUrl;
      if(w === img.width && h === img.height && file.type === 'image/jpeg'){
        // O'lcham o'zgarmadi — qayta siqmasdan asl faylni to'g'ridan-to'g'ri yuboramiz.
        dataUrl = reader.result;
      }else{
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }
      const box = document.getElementById('npImagePreview');
      box.innerHTML = `<div class="smallMuted">Yuklanmoqda...</div>`;
      box.classList.remove('hidden');
      const url = await uploadDataUrlToHost(dataUrl, 'products');
      if(!url){ box.classList.add('hidden'); box.innerHTML=''; return; }
      pendingImage = url;
      box.innerHTML = `<img src="${pendingImage}">`;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function adminProdCardHtml(p, idx, total){
  const ro = (typeof reorderMode !== 'undefined') && reorderMode;
  return `
    <div class="prodCard" style="cursor:default;" data-pid="${p.id}">
      ${ro ? `<div class="roBar">
         <button class="roBtn" ${idx === 0 ? 'disabled' : ''} onclick="event.stopPropagation(); moveProduct('${p.id}',-1)">↑</button>
         <span class="roNum">${(idx != null ? idx + 1 : '')}</span>
         <button class="roBtn" ${(total != null && idx === total - 1) ? 'disabled' : ''} onclick="event.stopPropagation(); moveProduct('${p.id}',1)">↓</button>
       </div>` : ''}
      ${p.stock<=0?'<div class="outOfStockTag">Tugagan</div>':''}
      <div class="prodImgWrap"><div class="prodImg">${prodThumb(p,26)}</div></div>
      <div class="prodBody">
        <div class="pname">${p.name}</div>
        <div class="pgram">${p.gram} g · ${fmt(p.price)} so'm${(p.priceStore&&p.priceStore>0)?` · <span style="color:var(--forest-dark);font-weight:800;">${fmt(p.priceStore)} (magazin)</span>`:''}</div>
        <div class="pstockRow"><span class="pstock">${p.stock}</span><span class="pstocklbl">dona omborda</span></div>
        <div class="prodBtnRow">
          <button class="ghostBtn" onclick="openProductModal('${p.id}')">${ic('edit',13)}Tahrirlash</button>
          <button class="ghostBtn" onclick="showProductQr('${p.id}')">${ic('qr',13)}QR</button>
        </div>
      </div>
    </div>`;
}

function renderScanSession(){
  document.getElementById('sessionStat').innerHTML = scanMode==='out' ? `
    <div class="box"><div class="n">${sessionQty}</div><div class="l">Sotilgan dona</div></div>
    <div class="box"><div class="n">${fmt(sessionRevenue)}</div><div class="l">Tushum (so'm)</div></div>
  ` : '';
  const list = document.getElementById('sessionList');
  const entries = Object.entries(sessionItems);
  list.innerHTML = entries.map(([pid,qty])=>{
    const p = state.products.find(x=>x.id===pid);
    return `<div class="sessionRow"><span>${p?p.name:'?'}</span><b>${qty} dona</b></div>`;
  }).join('');
}

function setDebtsAdminFilter(f){
  debtsAdminFilter = f;
  const bAll = document.getElementById('debtsTabAll'), bSoon = document.getElementById('debtsTabSoon');
  if(bAll) bAll.classList.toggle('active', f==='all');
  if(bSoon) bSoon.classList.toggle('active', f==='soon');
  renderDebtsAdmin();
}

function renderDebtsAdmin(){
  const box = document.getElementById('debtsAdminList');
  const statBox = document.getElementById('qarzStatRow');
  const allDebts = state.ledger.filter(l=>l.debt>0);
  if(statBox){
    const totalSum = allDebts.reduce((s,l)=>s+l.debt,0);
    const overdueCount = allDebts.filter(l=>l.due && l.due<todayISO()).length;
    statBox.innerHTML = `
      <div class="qarzStatPill" style="background:linear-gradient(135deg,#EA5A1F,#B8430F);"><div class="v">${allDebts.length}</div><div class="k">Qarzdorlar soni</div></div>
      <div class="qarzStatPill" style="background:linear-gradient(135deg,#0A7AFF,#0A5FCC);"><div class="v">${fmt(totalSum)}</div><div class="k">Jami qarz, so'm</div></div>
      <div class="qarzStatPill" style="background:linear-gradient(135deg,#EF4B62,#C22B2B);"><div class="v">${overdueCount}</div><div class="k">Muddati o'tgan</div></div>
    `;
  }
  let rows = [...allDebts].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  if(debtsAdminFilter==='soon') rows = rows.filter(isDebtDueSoon);
  box.innerHTML = rows.map(l=>{
    const overdue = l.due && l.due < todayISO();
    const color = qarzColorFor(l.partyName);
    return `
    <div class="card qarzRow" onclick="openLedgerDetail('${l.id}')">
      <div class="qarzAvatar" style="background:${color};">${initialsOf(l.partyName)}</div>
      <div class="mid">
        <div class="nm">${l.partyName}</div>
        <div class="sub">${l.ownerName?l.ownerName+' · ':''}${overdue?'Muddati o\'tgan!':(l.due?('Muddat: '+l.due):'Muddat belgilanmagan')}</div>
      </div>
      <div class="amt" style="color:${overdue?'var(--danger)':'var(--terracotta-deep, #B8430F)'};">${fmt(l.debt)}<small>so'm qarz</small></div>
    </div>
  `;
  }).join('') || emptyHtml('check', debtsAdminFilter==='soon' ? 'Muddati yaqinlashgan qarz yo\'q' : 'Hech kim qarzdor emas');
}

function previewCourierPhoto(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const maxSize = 300;
      let w = img.width, h = img.height;
      if(w>h){ if(w>maxSize){ h=Math.round(h*maxSize/w); w=maxSize; } }
      else { if(h>maxSize){ w=Math.round(w*maxSize/h); h=maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      pendingCourierPhoto = canvas.toDataURL('image/jpeg',0.75);
      document.getElementById('courierPhotoPreview').src = pendingCourierPhoto;
      document.getElementById('courierPhotoPreview').classList.remove('hidden');
      document.getElementById('courierPhotoPlaceholder').classList.add('hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function shouldShowOnboarding(){
  try{ return !localStorage.getItem('utam_onboarded'); }catch(e){ return false; }
}

function showOnboarding(){
  onboardingIndex = 0;
  const box = document.getElementById('onboardingSlides');
  box.innerHTML = ONBOARDING_SLIDES.map((s,i)=>`
    <div class="onboardingSlide${i===0?' active':''}" data-idx="${i}">
      <div class="onboardingIconWrap">${ic(s.icon,44)}</div>
      <h2>${s.title}</h2>
      <p>${s.text}</p>
    </div>
  `).join('');
  document.getElementById('onboardingDots').innerHTML = ONBOARDING_SLIDES.map((_,i)=>`<span class="onboardingDot${i===0?' active':''}"></span>`).join('');
  document.getElementById('onboardingBg').classList.remove('hidden');
}

function onboardingNext(){
  onboardingIndex++;
  if(onboardingIndex >= ONBOARDING_SLIDES.length){ finishOnboarding(); return; }
  document.querySelectorAll('.onboardingSlide').forEach((el,i)=>el.classList.toggle('active', i===onboardingIndex));
  document.querySelectorAll('.onboardingDot').forEach((el,i)=>el.classList.toggle('active', i===onboardingIndex));
  document.getElementById('onboardingNextBtn').textContent = onboardingIndex===ONBOARDING_SLIDES.length-1 ? "Boshlash" : "Keyingisi";
}

function skipOnboarding(){ finishOnboarding(); }

function finishOnboarding(){
  try{ localStorage.setItem('utam_onboarded','1'); }catch(e){}
  document.getElementById('onboardingBg').classList.add('hidden');
}

function setOrdersAdminFilter(f){
  ordersAdminFilter = f;
  const bA = document.getElementById('ordersTabActive'), bD = document.getElementById('ordersTabDelivered'), bAll = document.getElementById('ordersTabAll');
  if(bA) bA.classList.toggle('active', f==='active');
  if(bD) bD.classList.toggle('active', f==='delivered');
  if(bAll) bAll.classList.toggle('active', f==='all');
  renderOrdersAdmin();
}

function renderOrdersAdmin(){
  const box = document.getElementById('ordersAdminList');
  if(!box) return;
  let rows = [...state.orders].reverse();
  if(ordersAdminFilter==='active') rows = rows.filter(o=>o.status!=='yetkazildi');
  else if(ordersAdminFilter==='delivered') rows = rows.filter(o=>o.status==='yetkazildi');
  // Har bir buyurtmani ALOHIDA xavfsiz tarzda chizamiz — agar BITTASI xato bersa,
  // faqat o'sha bittasi diagnostika xabari bilan ko'rsatiladi, qolgan buyurtmalar
  // va butun ro'yxat (avvalgidek "eskirib" qolmasdan) baribir to'g'ri yangilanadi.
  box.innerHTML = rows.map(o=>{
    try{ return orderCardHtml(o); }
    catch(err){
      console.error('orderCardHtml xatosi, buyurtma ID:', o.id, err);
      return `<div class="card" style="border:2px solid var(--danger);"><b style="color:var(--danger);">⚠️ Diagnostika: bu buyurtmani ko'rsatishda xato (ID: ${o.id})</b><div class="smallMuted" style="margin-top:6px;">${(err&&err.message)||err}</div></div>`;
    }
  }).join('') || emptyHtml('receipt', ordersAdminFilter==='delivered' ? 'Yetkazib berilgan buyurtma yo\'q' : 'Hali buyurtma yo\'q');
}

function adminOpenChat(userId){
  const u = state.users.find(x=>x.id===userId);
  const chat = getOrCreateChat(userId, (state.chats.find(x=>x.userId===userId)||{}).userName || (u?u.name:'Mijoz'));
  activeChatUserId = userId;
  chat.unreadAdmin = false;
  cancelEditMessage();
  document.getElementById('chatTitle').textContent = chat.userName || 'Mijoz';
  document.getElementById('chatInput').value = '';
  renderChatThread();
  updateChatBlockUI();
  openModal('modalChat');
  saveState();
  renderChatList();
}

function adminDeleteMessage(idx){
  const chat = state.chats.find(x=>x.userId===activeChatUserId);
  if(!chat || !chat.messages[idx]) return;
  if(!confirm("Ushbu xabarni o'chirmoqchimisiz?")) return;
  chat.messages.splice(idx,1);
  saveState();
  renderChatThread();
}
