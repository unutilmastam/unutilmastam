/* Unutilmas Ta'm — 24-fbauth.js
   ═══════════════════════════════════════════════════════════════
   FIREBASE KIRISH — xavfsizlik qoidalari uchun asos

   Ilgari ilova Firebase'ga NOMSIZ ulanardi: Firebase admin va magazin
   egasini ajrata olmasdi. Shuning uchun xavfsizlik qoidalari hech
   narsani to'sa olmasdi.

   Endi:
     • har bir foydalanuvchi ANONIM kiradi  -> o'qish va oddiy yozish
     • admin EMAIL + PAROL bilan kiradi     -> barcha yozish
   Qoidalar (firestore.rules) aynan shu farqqa tayanadi.

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

const FB_ADMIN_EMAIL = 'admin@unutilmastam.uz';

let __fbAuthReady = false;
let __fbAuthWaiters = [];
let __fbAuthError = '';
let __fbAdminWarned = false;

function fbAuth(){
  try{ return (window.firebase && firebase.auth) ? firebase.auth() : null; }catch(e){ return null; }
}

function fbUser(){ const a = fbAuth(); return a ? a.currentUser : null; }

function fbIsAdmin(){
  const u = fbUser();
  return !!(u && !u.isAnonymous && u.email === FB_ADMIN_EMAIL);
}

/* Kirish tayyor bo'lgach chaqiriladi. Auth kutubxonasi bo'lmasa yoki
   6 soniyada javob bo'lmasa ham davom etadi — ilova to'xtab qolmasin. */
function whenFirebaseAuthReady(cb){
  if(__fbAuthReady){ cb(); return; }
  __fbAuthWaiters.push(cb);
  if(__fbAuthWaiters.length > 1) return;

  const done = function(){
    if(__fbAuthReady) return;
    __fbAuthReady = true;
    const ws = __fbAuthWaiters; __fbAuthWaiters = [];
    ws.forEach(function(f){ try{ f(); }catch(e){ console.warn(e); } });
  };

  const a = fbAuth();
  if(!a){ __fbAuthError = 'Auth kutubxonasi yuklanmadi'; done(); return; }

  setTimeout(done, 6000);
  const unsub = a.onAuthStateChanged(function(user){
    if(user){ try{ unsub(); }catch(e){} done(); return; }
    a.signInAnonymously().catch(function(e){
      __fbAuthError = (e && e.code) || String(e);
      console.warn('Anonim kirish:', __fbAuthError);
      done();
    });
  });
}

/* Admin ilovaga kirganda — Firebase'ga ham admin sifatida kiradi.
   Parol = admin kodi (Firebase konsolida shu parol bilan foydalanuvchi
   yaratiladi). */
async function fbSignInAdmin(code){
  const a = fbAuth();
  if(!a) return { ok:false, error:'Auth kutubxonasi yuklanmadi' };
  try{
    await a.signInWithEmailAndPassword(FB_ADMIN_EMAIL, code);
    __fbAdminWarned = false;
    return { ok:true };
  }catch(e){
    __fbAuthError = (e && e.code) || String(e);
    console.warn('Admin Firebase kirishi:', __fbAuthError);
    /* anonim holatga qaytamiz — o'qish ishlab tursin */
    try{ if(!a.currentUser) await a.signInAnonymously(); }catch(x){}
    return { ok:false, error:__fbAuthError };
  }
}

/* Admin chiqganda — oddiy (anonim) holatga qaytadi */
async function fbSignOutAdmin(){
  const a = fbAuth();
  if(!a || !fbIsAdmin()) return;
  try{ await a.signOut(); await a.signInAnonymously(); }catch(e){}
}

/* Holat — Tizim holati oynasi uchun */
function fbStatus(){
  const u = fbUser();
  if(!fbAuth()) return { level:'bad', text:"Firebase kirish kutubxonasi yuklanmadi" };
  if(!u) return { level:'bad', text:"Firebase'ga kirilmagan" + (__fbAuthError ? ' (' + __fbAuthError + ')' : '') };
  if(fbIsAdmin()) return { level:'ok', text:'Firebase: admin sifatida ulangan ✓' };
  if(currentUser && currentUser.role === 'admin')
    return { level:'warn', text:"Firebase: oddiy foydalanuvchi — admin o'zgarishlari qoidalar yoqilgach saqlanmaydi" +
                                 (__fbAuthError ? ' (' + __fbAuthError + ')' : '') };
  return { level:'ok', text:'Firebase: anonim ulangan ✓' };
}

/* Admin yozishi rad etilganda — bir marta ogohlantiramiz */
function fbWarnAdminDenied(){
  if(__fbAdminWarned) return;
  __fbAdminWarned = true;
  if(currentUser && currentUser.role === 'admin'){
    alert("Diqqat: o'zgarishlar bulutga saqlanmayapti.\n\n" +
          "Firebase admin kirishi yo'q. Tizim holati oynasini oching.");
  }
}

/* ───────── Admin kirish / chiqishga ulash ───────── */
(function(){
  if(typeof adminLoginSubmit === 'function'){
    const orig = adminLoginSubmit;
    adminLoginSubmit = async function(){
      const inp = document.getElementById('adminCodeInput');
      const code = inp ? inp.value.trim() : '';
      const r = await orig.apply(this, arguments);
      /* ilovaga kirish muvaffaqiyatli bo'lgan bo'lsa — Firebase'ga ham */
      setTimeout(async function(){
        if(currentUser && currentUser.role === 'admin' && code && !fbIsAdmin()){
          await fbSignInAdmin(code);
          if(typeof scheduleFlush === 'function') scheduleFlush(500);
        }
      }, 1200);
      return r;
    };
  }
  if(typeof logout === 'function'){
    const origOut = logout;
    logout = function(){
      const wasAdmin = currentUser && currentUser.role === 'admin';
      const r = origOut.apply(this, arguments);
      if(wasAdmin) fbSignOutAdmin();
      return r;
    };
  }
})();

/* Tizim holati oynasida Firebase ulanishi ko'rinsin */
(function(){
  if(typeof openSystemHealth !== 'function') return;
  const orig = openSystemHealth;
  openSystemHealth = function(){
    orig.apply(this, arguments);
    const body = document.getElementById('shBody');
    if(!body) return;
    const st = fbStatus();
    const div = document.createElement('div');
    div.className = 'fbStatus ' + st.level;
    div.textContent = st.text;
    body.insertBefore(div, body.firstChild);
  };
})();
